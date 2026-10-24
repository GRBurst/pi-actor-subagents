/**
 * Starts a child session's extensions as unattended, with their footer statuses captured.
 *
 * A child has no human watching it, so its extensions must take their documented headless paths:
 * an extension that asks before acting (`if (ctx.hasUI) confirm(...)`) must fall back to its
 * policy instead of receiving an instant cancellation that the model would read as "the user
 * declined". Its footer statuses (`ctx.ui.setStatus`) still belong in the roster.
 *
 * Pi has one switch for both: `hasUI()` is `uiContext !== noOpUIContext`, so any capturing
 * context turns it true. The runner's `hasUI` is therefore overridden on this session's runner
 * instance, and the session is bound with `mode: "print"`, Pi's mode for "no UI". Extensions
 * that call `setStatus` unconditionally (the Pi idiom: a no-op without a UI) are captured;
 * extensions that set a status only when `ctx.hasUI` is true are not.
 *
 * The capturing context spreads the runner's context BEFORE binding, which is still Pi's no-op
 * context: it stays in step with Pi's UI interface instead of re-implementing ~30 methods, and
 * every method other than `setStatus` keeps Pi's no-op behavior.
 * Contract test against the installed Pi: pi-bind-headless-extensions.test.ts.
 */
import type { AgentSession, ExtensionUIContext } from "@earendil-works/pi-coding-agent";

export async function bindHeadlessExtensions(
	session: Pick<AgentSession, "extensionRunner" | "bindExtensions">,
	setStatus: ExtensionUIContext["setStatus"],
): Promise<void> {
	const runner = session.extensionRunner;
	const uiContext: ExtensionUIContext = { ...runner.getUIContext(), setStatus };
	// Before binding: `session_start` handlers already read `ctx.hasUI`. The override lives on this
	// runner instance only; `session.reload()` builds a new runner and would reset it (children are
	// never reloaded: index.ts reloads only settings and the resource loader).
	runner.hasUI = () => false;
	await session.bindExtensions({ mode: "print", uiContext });
}
