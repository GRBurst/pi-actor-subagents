import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Model } from "@earendil-works/pi-ai";
import { createAgentSession, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import { createRoutedAgentMessage, toCustomAgentMessage } from "./agent-message.ts";

// Contract with the installed Pi: lifecycle notices rely on sendCustomMessage with
// triggerTurn:false appending to an IDLE session's transcript without starting a run
// (Engine.notify only appends while the agent is not busy). Offline: the model is never called.
const model: Model<"openai-responses"> = {
	id: "test-model", name: "Test model", api: "openai-responses", provider: "openai",
	baseUrl: "https://unused.invalid", reasoning: false, input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 10000, maxTokens: 1000,
};

test("installed Pi: triggerTurn false on an idle session appends without starting a turn", async (t) => {
	const dir = mkdtempSync(join(tmpdir(), "pi-silent-append-"));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	const { session } = await createAgentSession({
		cwd: dir,
		agentDir: dir,
		model,
		sessionManager: SessionManager.inMemory(dir),
		settingsManager: SettingsManager.inMemory({}),
	});
	t.after(() => session.dispose());
	const events: string[] = [];
	session.subscribe((e) => void events.push(e.type));

	assert.equal(session.isStreaming, false);
	const notice = toCustomAgentMessage(createRoutedAgentMessage("scheduler", "[09:05:07] your subagent b was paused by user."));
	await session.sendCustomMessage(notice, { triggerTurn: false });

	assert.equal(session.isStreaming, false);
	assert.deepEqual(events, ["message_start", "message_end"], "no agent_start: no run");
	const last = session.messages.at(-1) as { role?: string; customType?: string; content?: unknown };
	assert.equal(last.role, "custom");
	assert.equal(last.customType, notice.customType);
	assert.equal(last.content, notice.content);
});

test("installed Pi: active scheduler errors prompt idle parents and steer busy parents without silent append", async (t) => {
	const dir = mkdtempSync(join(tmpdir(), "pi-active-error-"));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	const { session } = await createAgentSession({
		cwd: dir, agentDir: dir, model,
		sessionManager: SessionManager.inMemory(dir), settingsManager: SettingsManager.inMemory({}),
	});
	t.after(() => session.dispose());
	// Replace the provider-driving entry point, not the SDK's custom-message routing. No model call.
	let finish!: () => void;
	const pending = new Promise<void>((resolve) => { finish = resolve; });
	t.after(() => finish());
	let prompted: unknown;
	const steered: unknown[] = [];
	session.agent.prompt = async (message) => { prompted = message; await pending; };
	session.agent.steer = (message) => void steered.push(message);
	const error = toCustomAgentMessage(createRoutedAgentMessage("scheduler", "child failed", true));
	const idleRun = session.sendCustomMessage(error, { triggerTurn: true, deliverAs: "steer" });
	assert.equal(session.isStreaming, true, "idle message entered the run path");
	assert.deepEqual(prompted, { role: "custom", ...error, timestamp: (prompted as { timestamp: number }).timestamp });
	await session.sendCustomMessage(error, { triggerTurn: true, deliverAs: "steer" });
	assert.equal(steered.length, 1, "busy message uses ordinary steering");
	assert.equal(session.messages.length, 0, "no duplicate silent append outside the agent path");
	finish();
	await idleRun;
	assert.equal(session.isStreaming, false);
});
