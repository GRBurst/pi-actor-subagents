/**
 * The UI context a child session's extensions see. Children have no terminal, but their
 * extensions' footer statuses (`ctx.ui.setStatus`) belong in the roster, so the child is a
 * headless UI host, like Pi's RPC mode (Pi docs: rpc-extension-ui.md): `setStatus` goes to the
 * caller, every other method keeps Pi's own no-op behavior, so dialogs resolve as cancelled.
 *
 * Built by spreading the runner's context BEFORE `bindExtensions`, which is still Pi's no-op
 * context: that stays in step with Pi's UI interface instead of re-implementing ~30 methods.
 * Consequence for extensions: `ctx.hasUI` is true (any non-no-op context counts) and the caller
 * binds `mode: "rpc"`, the documented pair for a UI host without a terminal.
 * Contract test against the installed Pi: pi-headless-ui-context.test.ts.
 */
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";

export function headlessUiContext(
	unboundRunner: { getUIContext(): ExtensionUIContext },
	setStatus: ExtensionUIContext["setStatus"],
): ExtensionUIContext {
	return { ...unboundRunner.getUIContext(), setStatus };
}
