import { test } from "node:test";
import assert from "node:assert/strict";
import { agentStatus, formatStatus } from "./agent-status.ts";

test("agentStatus: spawning and paused take precedence over the turn phase", () => {
	assert.deepEqual(agentStatus({ pending: true, activity: "thinking", pause: { by: "user" } }), { kind: "spawning" });
	assert.deepEqual(agentStatus({ pause: { by: "user" }, activity: "tool", currentTool: "bash" }), {
		kind: "paused",
		by: "user",
	});
	assert.deepEqual(agentStatus({ activity: "writing" }), {
		kind: "working",
		phase: "writing",
		tool: undefined,
	});
});

test("agentStatus: idle carries the terminal outcome (error with its reason, truncated) of the last turn", () => {
	assert.deepEqual(agentStatus({ stopReason: "error", errorReason: "rate limited" }), {
		kind: "idle",
		outcome: "error",
		reason: "rate limited",
	});
	assert.deepEqual(agentStatus({ stopReason: "length" }), { kind: "idle", outcome: "truncated" });
	assert.deepEqual(agentStatus({ stopReason: "stop" }), { kind: "idle" });
	assert.deepEqual(agentStatus({ stopReason: "aborted" }), { kind: "idle" });
	assert.deepEqual(agentStatus({}), { kind: "idle" });
	// While streaming, the live phase wins over any stale stopReason.
	assert.deepEqual(agentStatus({ activity: "thinking", stopReason: "error" }), {
		kind: "working",
		phase: "thinking",
		tool: undefined,
	});
});

test("formatStatus renders the label for every status, with the cause", () => {
	assert.equal(formatStatus({ kind: "spawning" }), "spawning");
	assert.equal(formatStatus({ kind: "paused", by: "user" }), "paused by user");
	assert.equal(
		formatStatus({ kind: "paused", by: "user", holder: "lead" }),
		"paused (held by lead, paused by user)",
	);
	assert.equal(formatStatus({ kind: "working", phase: "thinking" }), "thinking");
	assert.equal(formatStatus({ kind: "working", phase: "writing" }), "writing");
	assert.equal(formatStatus({ kind: "working", phase: "tool", tool: "bash" }), "tool:bash");
	assert.equal(formatStatus({ kind: "working", phase: "tool" }), "tool");
	assert.equal(formatStatus({ kind: "idle" }), "idle");
	assert.equal(formatStatus({ kind: "idle", outcome: "error", reason: "boom" }), "error: boom");
	assert.equal(formatStatus({ kind: "idle", outcome: "truncated" }), "truncated");
});
