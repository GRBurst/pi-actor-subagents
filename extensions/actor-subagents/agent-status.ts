/**
 * The status vocabulary of an agent: one sum type, its derivation from the raw record
 * fields, and its rendering. Pure, SDK-free.
 *
 * Make illegal states unrepresentable + parse, don't validate: the status is derived ONCE
 * into `AgentStatus` and every consumer (roster label, panel tone, snapshot) switches on
 * `kind` instead of re-parsing the rendered label string. Adding a status therefore becomes
 * a compile error in every consumer instead of silently falling into a default branch.
 */

/** What an agent is doing right now, within a running turn. */
export type AgentActivity = "thinking" | "writing" | "tool";

/**
 * Terminal reason of an agent's last turn (mirror of pi-ai's StopReason; redeclared here to
 * keep the extension SDK-free). Only the idle-time outcomes matter for the status: "error"
 * (failed after the SDK exhausted its retries) and "length" (output truncated at max tokens).
 * "toolUse" never reaches idle (the agent keeps working), "aborted" is covered by pause/kill.
 */
export type StopReason = "stop" | "length" | "toolUse" | "error" | "aborted";

/**
 * Why an agent is paused: `by` is the actor that set the holding flag (an agent name, "user" or
 * "restore"); `holder` is the ancestor carrying that flag, absent when the agent's own flag holds it.
 */
export interface PauseCause {
	by: string;
	holder?: string;
}

/**
 * The four mutually exclusive things an agent can be, in precedence order:
 * spawning (session still starting) · paused (held by its own or an ancestor's pause, awaiting
 * resume) · working (a turn is running) · idle (turn finished, waiting for input).
 * A paused status carries its cause, so every consumer can say why without looking anything up.
 * An errored idle status is just the fact: the reason can be long (a provider's raw error), so it
 * stays on the record (`errorReason`) and is read only where a reader asks for it on purpose —
 * the parent's error notice (lifecycle-notice.ts) and the subagent_history header.
 */
export type AgentStatus =
	| { kind: "spawning" }
	| ({ kind: "paused" } & PauseCause)
	| { kind: "working"; phase: AgentActivity; tool?: string }
	| { kind: "idle"; outcome?: "truncated" | "error" };

/** The record fields the status is derived from (structural, so any record shape fits). */
export interface StatusInputs {
	pending?: boolean;
	/** The phase of the running turn; undefined means no turn is running. */
	activity?: AgentActivity;
	currentTool?: string;
	/**
	 * The effective pause (its own flag or an ancestor's, as Engine.status derives it): it runs
	 * nothing until resumed, so "idle" would misread as ready.
	 */
	pause?: PauseCause;
	stopReason?: StopReason;
}

/**
 * Single source of truth for an agent's status, shared by the agent-facing roster
 * (list_subagents) and the TUI panel so the vocabulary stays consistent.
 */
export function agentStatus(r: StatusInputs): AgentStatus {
	if (r.pending) return { kind: "spawning" };
	if (r.pause) return { kind: "paused", ...r.pause };
	if (!r.activity) {
		// Idle: surface a noteworthy terminal outcome of the last turn, else plain idle.
		if (r.stopReason === "error") return { kind: "idle", outcome: "error" };
		if (r.stopReason === "length") return { kind: "idle", outcome: "truncated" };
		return { kind: "idle" };
	}
	return { kind: "working", phase: r.activity, tool: r.currentTool };
}

/**
 * The short status label for every table and column (TUI roster, panel roster, list_subagents):
 * spawning · paused · thinking · writing · tool:<name> · idle · error · truncated.
 * Causes are left out so a column stays narrow and scannable; formatStatusDetail adds them.
 */
export function formatStatus(s: AgentStatus): string {
	switch (s.kind) {
		case "spawning":
			return "spawning";
		case "paused":
			return "paused";
		case "working":
			return s.phase === "tool" ? (s.tool ? `tool:${s.tool}` : "tool") : s.phase;
		case "idle":
			return s.outcome ?? "idle";
	}
}

/**
 * The status with its cause, for where a single agent is read on purpose (subagent_history header,
 * send/spawn delivery results, the panel's selected-agent line): paused by <actor> ·
 * paused (held by <ancestor>, paused by <actor>); every other status is its short label.
 */
export function formatStatusDetail(s: AgentStatus): string {
	if (s.kind !== "paused") return formatStatus(s);
	return s.holder ? `paused (held by ${s.holder}, paused by ${s.by})` : `paused by ${s.by}`;
}
