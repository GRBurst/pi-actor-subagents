import assert from "node:assert/strict";
import { test } from "node:test";
import {
	createRoutedAgentMessage,
	isLifecycleNotice,
	parseRoutedAgentMessage,
	formatAgentMessageDisplay,
	mergeRoutedAgentMessages,
	toCustomAgentMessage,
} from "./agent-message.ts";

test("a routed agent message keeps structured provenance and a provider-visible sender", () => {
	const routed = createRoutedAgentMessage("reviewer", "Found the cause.");

	assert.deepEqual(toCustomAgentMessage(routed), {
		customType: "agent-message",
		content: "[message from reviewer]: Found the cause.",
		display: true,
		details: routed,
	});
	assert.deepEqual(formatAgentMessageDisplay(routed), {
		label: "from reviewer",
		body: "Found the cause.",
	});
});

test("an atomic paused-inbox batch preserves every sender and message", () => {
	const merged = mergeRoutedAgentMessages([
		createRoutedAgentMessage("reviewer", "First finding."),
		createRoutedAgentMessage("coder", "Applied the fix."),
	]);

	assert.equal(
		toCustomAgentMessage(merged).content,
		"[message from reviewer]: First finding.\n\n[message from coder]: Applied the fix.",
	);
	assert.deepEqual(formatAgentMessageDisplay(merged), {
		label: "from reviewer, coder",
		body: "[reviewer]\nFirst finding.\n\n[coder]\nApplied the fix.",
	});
});

test("actionable metadata survives parsing and mixed mailbox batches; legacy scheduler notices stay silent", () => {
	const legacy = createRoutedAgentMessage("scheduler", "legacy silent");
	const error = createRoutedAgentMessage("scheduler", "new error", true);
	const mixed = mergeRoutedAgentMessages([legacy, error, createRoutedAgentMessage("peer", "reply")]);
	const parsed = parseRoutedAgentMessage(JSON.parse(JSON.stringify(mixed)));
	assert.deepEqual(parsed, mixed);
	assert.equal(isLifecycleNotice("agent-message", legacy), true);
	assert.equal(isLifecycleNotice("agent-message", error), false);
	assert.equal(isLifecycleNotice("agent-message", mixed), false);
});
