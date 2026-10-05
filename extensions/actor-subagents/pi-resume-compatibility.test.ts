import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { AssistantMessage, Message, Model, ToolResultMessage } from "@earendil-works/pi-ai";
import { convertMessages as convertGoogleMessages } from "@earendil-works/pi-ai/api/google-shared";
import { convertResponsesMessages } from "@earendil-works/pi-ai/api/openai-responses-shared";
import { transformMessages } from "@earendil-works/pi-ai/api/transform-messages";
import { convertToLlm, SessionManager } from "@earendil-works/pi-coding-agent";
import { createRoutedAgentMessage, toCustomAgentMessage } from "./agent-message.ts";
import { deriveStatus } from "./persistence-logic.ts";

// Test the installed Pi implementation, not a second normalizer. These are offline request
// projections: gateway/custom providers and future Pi versions are separate boundaries.
const model: Model<"openai-responses"> = {
	id: "test-model", name: "Test model", api: "openai-responses", provider: "openai",
	baseUrl: "https://unused.invalid", reasoning: false, input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 10000, maxTokens: 1000,
};
const assistant = (ids: string[], stopReason: AssistantMessage["stopReason"] = "toolUse"): AssistantMessage => ({
	role: "assistant", api: model.api, provider: model.provider, model: model.id,
	content: [{ type: "text", text: "observed assistant text" }, ...ids.map((id) => ({
		type: "toolCall" as const, id, name: "write", arguments: { path: id, content: "payload" },
	}))],
	usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
	stopReason, timestamp: 10,
});
const result = (id: string, isError = false): ToolResultMessage => ({
	role: "toolResult", toolCallId: id, toolName: "write",
	content: [{ type: "text", text: `observed result ${id}` }],
	details: { observed: true }, isError, timestamp: 20,
});
const user: Message = { role: "user", content: "continue", timestamp: 30 };
const peer = { role: "custom" as const,
	...toCustomAgentMessage(createRoutedAgentMessage("parent", "inspect the file")), timestamp: 30 };
const cases = [
	{ name: "tail open call", messages: [assistant(["a"])], missing: ["a"], status: "pausedMidTurn" },
	{ name: "parallel partial results", messages: [assistant(["a", "b", "c"]), result("b")],
		missing: ["a", "c"], status: "pausedMidTurn" },
	{ name: "user after open call (no duplicate late result)", messages: [assistant(["a"]), user],
		missing: ["a"], status: "pausedMidTurn" },
	{ name: "peer after open call (no duplicate late result)", messages: [assistant(["a"]), peer],
		missing: ["a"], status: "pausedMidTurn" },
	{ name: "parallel partial result followed by peer (original duplicate bug)",
		messages: [assistant(["a", "b"]), result("a"), peer], missing: ["b"], status: "pausedMidTurn" },
	{ name: "older unresolved call before later assistant", messages: [assistant(["old"]), assistant([], "stop")],
		missing: ["old"], status: "idle" },
	{ name: "aborted assistant is observed but not replayed", messages: [assistant(["a"], "aborted")],
		missing: [], status: "pausedMidTurn" },
	{ name: "errored assistant is observed but not replayed", messages: [assistant(["a"], "error")],
		missing: [], status: "pausedMidTurn" },
	{ name: "observed successful and failed results", messages: [assistant(["a", "b"]), result("a"), result("b", true), assistant([], "stop")],
		missing: [], status: "idle" },
];

for (const fixture of cases) {
	test(`installed Pi resume compatibility: ${fixture.name}`, (t) => {
		t.mock.method(Date, "now", () => 1000);
		const dir = mkdtempSync(join(tmpdir(), "pi-resume-"));
		t.after(() => rmSync(dir, { recursive: true, force: true }));
		const file = join(dir, "child.jsonl");
		const entries = fixture.messages.map((message, i) => ({
			type: "message", id: `entry${i}`, parentId: i ? `entry${i - 1}` : null,
			timestamp: "2026-01-01T00:00:00.000Z", message,
		}));
		const bytes = [{ type: "session", version: 3, id: "test-session",
			timestamp: "2026-01-01T00:00:00.000Z", cwd: dir }, ...entries]
			.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
		writeFileSync(file, bytes);
		let previousProjection: Message[] | undefined;
		for (let reopen = 0; reopen < 3; reopen++) {
			const sm = SessionManager.open(file);
			assert.deepEqual(sm.getEntries(), entries);
			const history = sm.buildSessionContext().messages;
			const observed = structuredClone(history);
			assert.deepEqual(history, fixture.messages);
			assert.equal(deriveStatus(history), fixture.status);
			const llm = convertToLlm(history);
			const projected = transformMessages(llm, model);
			if (fixture.name.startsWith("aborted") || fixture.name.startsWith("errored")) {
				assert.deepEqual(projected, []);
			}
			const synthetic = projected.filter((m): m is ToolResultMessage =>
				m.role === "toolResult" && m.content.some((c) => c.type === "text" && c.text === "No result provided"));
			assert.deepEqual(synthetic.map((m) => m.toolCallId), fixture.missing);
			for (const id of fixture.missing) {
				assert.equal(projected.filter((m) => m.role === "toolResult" && m.toolCallId === id).length, 1);
				const callIndex = projected.findIndex((m) => m.role === "assistant" &&
					m.content.some((c) => c.type === "toolCall" && c.id === id));
				const resultIndex = projected.findIndex((m) => m.role === "toolResult" && m.toolCallId === id);
				assert.ok(resultIndex > callIndex);
				assert.ok(projected.slice(callIndex + 1, resultIndex).every((m) => m.role === "toolResult"));
			}
			for (const message of llm.filter((m) => m.role === "toolResult")) {
				assert.deepEqual(projected.find((m) => m.role === "toolResult" && m.toolCallId === message.toolCallId), message);
			}
			assert.deepEqual(transformMessages(projected, model), projected);
			if (previousProjection) assert.deepEqual(projected, previousProjection);
			previousProjection = projected;
			// Public installed adapter conversions independently exercise the provider boundary.
			const responses = convertResponsesMessages(model, { messages: llm }, new Set(["openai"]));
			assert.deepEqual(responses.filter((m) => m.type === "function_call_output").map((m) => m.call_id),
				projected.filter((m) => m.role === "toolResult").map((m) => m.toolCallId));
			const google = convertGoogleMessages({ ...model, api: "google-generative-ai", provider: "google", compat: undefined }, { messages: llm });
			assert.equal(google.flatMap((m) => m.parts ?? []).filter((p) => p.functionResponse).length,
				projected.filter((m) => m.role === "toolResult").length);
			assert.deepEqual(history, observed);
			assert.deepEqual(sm.getEntries(), entries);
			assert.equal(readFileSync(file, "utf8"), bytes);
		}
	});
}
