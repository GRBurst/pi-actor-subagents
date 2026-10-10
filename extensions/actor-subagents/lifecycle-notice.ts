/**
 * Who learns what happened to an agent's children, and what they are told. Pure decision; the
 * engine delivers the notices silently (Functional Core, Imperative Shell).
 *
 * The spawn tree is the ownership structure: a child exists to serve its spawner, so the direct
 * parent is the one agent whose picture of its work goes stale when the child is paused,
 * resumed, killed or breaks. Telling it keeps that picture true (The Map Is Not the Territory)
 * without waking it: a notice is a fact for its next turn, not a call to act.
 */

/** A child of `parent` that a lifecycle change hit directly. */
export interface LifecycleTarget {
	name: string;
	parent: string;
}

/**
 * One lifecycle operation. For pause/resume/kill, `targets` are the agents the operation named or
 * flagged — not the subtree that follows them, whose own parents are being acted on too. `by` is
 * the actor (an agent name, "user" or "restore"). An error has a reason and no actor.
 */
export type LifecycleChange =
	| { kind: "paused" | "killed"; by: string; targets: LifecycleTarget[] }
	| { kind: "resumed"; by: string; targets: (LifecycleTarget & { holder?: string })[] }
	| { kind: "error"; target: LifecycleTarget; reason: string };

export interface LifecycleNotice {
	/** The agent to tell: a direct parent of the affected children. */
	to: string;
	content: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** Local wall-clock time, the same shape as the tool-result stamps (tool-timestamp.ts). */
const clock = (now: Date) => `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

/**
 * The notices for one change: one per recipient, listing all its affected children.
 *
 * Silent cases: the parent is the actor (nobody is told about their own action), the parent is
 * not live — which a kill decides AFTER the operation, so a parent taken down in the same
 * operation is skipped — or the agent is the root ('main' is its own parent). An errored agent
 * must itself still be live: an error of an agent already removed reports nothing anyone can act on.
 */
export function lifecycleNotices(change: LifecycleChange, live: ReadonlySet<string>, now: Date): LifecycleNotice[] {
	const targets = change.kind === "error" ? (live.has(change.target.name) ? [change.target] : []) : change.targets;
	const by = change.kind === "error" ? undefined : change.by;
	const childrenOf = new Map<string, (LifecycleTarget & { holder?: string })[]>();
	for (const target of targets) {
		const { name, parent } = target;
		if (parent === name || parent === by || !live.has(parent)) continue;
		childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), target]);
	}
	return [...childrenOf].map(([to, children]) => {
		// Keep one notice per parent, even when some own pauses clear without releasing agents.
		const groups = new Map<string | undefined, string[]>();
		for (const child of children) {
			const holder = change.kind === "resumed" ? child.holder : undefined;
			groups.set(holder, [...(groups.get(holder) ?? []), child.name]);
		}
		const clauses = [...groups].map(([holder, names]) => {
			const one = names.length === 1;
			const subject = one ? `your subagent ${names[0]}` : `your subagents ${names.join(", ")}`;
			if (holder) return `the ${one ? "pause" : "pauses"} on ${subject} ${one ? "was" : "were"} cleared by ${by}; still held by '${holder}'`;
			return change.kind === "error"
				? `${subject} entered the error state: ${change.reason.replace(/\.+$/, "")}`
				: `${subject} ${one ? "was" : "were"} ${change.kind} by ${by}`;
		});
		return { to, content: `[${clock(now)}] ${clauses.join(". ")}.` };
	});
}
