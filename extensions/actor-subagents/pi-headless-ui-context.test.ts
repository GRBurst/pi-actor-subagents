import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Model } from "@earendil-works/pi-ai";
import {
	createAgentSession,
	DefaultResourceLoader,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { headlessUiContext } from "./headless-ui-context.ts";

// Contract with the installed Pi: child sessions are bound as headless UI hosts
// (headless-ui-context.ts, used in index.ts createSession). Extensions must see hasUI true and
// mode "rpc", their setStatus calls must reach the host, and dialogs must resolve as cancelled.
// Offline: the model is never called.
const model: Model<"openai-responses"> = {
	id: "test-model", name: "Test model", api: "openai-responses", provider: "openai",
	baseUrl: "https://unused.invalid", reasoning: false, input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 10000, maxTokens: 1000,
};

test("installed Pi: a headless UI context captures setStatus and cancels dialogs", async (t) => {
	const dir = mkdtempSync(join(tmpdir(), "pi-headless-ui-"));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	const settingsManager = SettingsManager.inMemory({});
	const seen: { hasUI?: boolean; mode?: string; confirmed?: boolean; selected?: unknown } = {};
	const resourceLoader = new DefaultResourceLoader({
		cwd: dir, agentDir: dir, settingsManager, noExtensions: true,
		extensionFactories: [{
			name: "status-probe",
			factory: (pi) => {
				pi.on("session_start", async (_event, ctx) => {
					seen.hasUI = ctx.hasUI;
					seen.mode = ctx.mode;
					ctx.ui.setStatus("probe", "ready");
					seen.confirmed = await ctx.ui.confirm("Allow?", "probe");
					seen.selected = await ctx.ui.select("Pick", ["a", "b"]);
				});
			},
		}],
	});
	await resourceLoader.reload();
	const { session } = await createAgentSession({
		cwd: dir, agentDir: dir, model, resourceLoader,
		sessionManager: SessionManager.inMemory(dir), settingsManager,
	});
	t.after(() => session.dispose());

	const statuses: [string, string | undefined][] = [];
	const uiContext = headlessUiContext(session.extensionRunner, (key, text) => void statuses.push([key, text]));
	await session.bindExtensions({ mode: "rpc", uiContext });

	assert.deepEqual(statuses, [["probe", "ready"]]);
	assert.equal(seen.hasUI, true);
	assert.equal(seen.mode, "rpc");
	assert.equal(seen.confirmed, false, "confirm resolves as declined");
	assert.equal(seen.selected, undefined, "select resolves as cancelled");
});
