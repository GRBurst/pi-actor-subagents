import assert from "node:assert/strict";
import { test } from "node:test";
import { lifecycleNotices } from "./lifecycle-notice.ts";

const live = (...names: string[]) => new Set(names);
const at = new Date(2025, 0, 2, 9, 5, 7);

test("a pause tells each direct parent once, listing its children, the actor and the time", () => {
	const notices = lifecycleNotices(
		{
			kind: "paused",
			by: "user",
			targets: [
				{ name: "a", parent: "main" },
				{ name: "x", parent: "lead" },
				{ name: "b", parent: "main" },
			],
		},
		live("main", "lead", "a", "b", "x"),
		at,
	);
	assert.deepEqual(notices, [
		{ to: "main", content: "[09:05:07] your subagents a, b were paused by user." },
		{ to: "lead", content: "[09:05:07] your subagent x was paused by user." },
	]);
});

test("nobody is told about their own action", () => {
	const change = { kind: "resumed" as const, by: "lead", targets: [{ name: "x", parent: "lead" }] };
	assert.deepEqual(lifecycleNotices(change, live("main", "lead", "x"), at), []);
	// The same change by an ancestor of the parent does reach it.
	assert.deepEqual(lifecycleNotices({ ...change, by: "main" }, live("main", "lead", "x"), at), [
		{ to: "lead", content: "[09:05:07] your subagent x was resumed by main." },
	]);
});

test("a kill skips a parent that the same operation took down", () => {
	const notices = lifecycleNotices(
		{
			kind: "killed",
			by: "user",
			targets: [
				{ name: "x", parent: "lead" },
				{ name: "lead", parent: "main" },
			],
		},
		live("main"),
		at,
	);
	assert.deepEqual(notices, [{ to: "main", content: "[09:05:07] your subagent lead was killed by user." }]);
});

test("an error tells the live parent of a live agent, with the reason and no actor", () => {
	const error = (name: string, parent: string, reason = "boom") => ({
		kind: "error" as const,
		target: { name, parent },
		reason,
	});
	assert.deepEqual(lifecycleNotices(error("worker", "lead"), live("main", "lead", "worker"), at), [
		{ to: "lead", content: "[09:05:07] your subagent worker entered the error state: boom." },
	]);
	assert.deepEqual(lifecycleNotices(error("main", "main"), live("main"), at), [], "the root has no parent");
	assert.deepEqual(lifecycleNotices(error("worker", "lead"), live("main", "lead"), at), [], "removed agent");
	assert.deepEqual(lifecycleNotices(error("worker", "lead"), live("main", "worker"), at), [], "removed parent");
	assert.match(
		lifecycleNotices(error("w", "main", "The operation was aborted."), live("main", "w"), at)[0]?.content ?? "",
		/aborted\.$/,
	);
});

test("one resume notice groups released and still-held direct children truthfully", () => {
	assert.deepEqual(lifecycleNotices({ kind: "resumed", by: "user", targets: [
		{ name: "a", parent: "lead" },
		{ name: "b", parent: "lead", holder: "lead" },
		{ name: "c", parent: "lead", holder: "lead" },
	] }, live("lead", "a", "b", "c"), at), [{
		to: "lead",
		content: "[09:05:07] your subagent a was resumed by user. the pauses on your subagents b, c were cleared by user; still held by 'lead'.",
	}]);
});
