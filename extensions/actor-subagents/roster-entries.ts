/**
 * Projects ordered agent records to the roster's row data. The footer widget (index.ts) and the
 * /subagents panel (panel.ts) render the same rows, so this is their single source (DRY): a new
 * roster field is added here once instead of drifting between the two call sites.
 */
import type { OrderedAgent } from "./agent-order.ts";
import type { AgentRecord } from "./agent-record.ts";
import type { Engine } from "./engine.ts";
import { formatExtensionStatuses } from "./extension-status.ts";
import { formatContext, formatSendTargets, type RosterEntry, rosterDepth } from "./panel-logic.ts";

export function rosterEntries(
	engine: Pick<Engine, "status" | "getMessageMatrix" | "liveNames">,
	ordered: OrderedAgent<AgentRecord>[],
): RosterEntry[] {
	const matrix = engine.getMessageMatrix();
	// The matrix is historical; only live names may appear in the targets column.
	const live = engine.liveNames();
	return ordered.map(({ agent: a, depth }) => ({
		name: a.name,
		depth: rosterDepth(depth),
		model: a.model,
		thinkingLevel: a.thinkingLevel,
		context: formatContext(a.view?.getContextUsage()),
		status: engine.status(a),
		customStatus: a.customStatus,
		etaTs: a.etaTs,
		targets: formatSendTargets(matrix, a.name, live),
		extensions: formatExtensionStatuses(a.view?.getExtensionStatuses?.()),
	}));
}
