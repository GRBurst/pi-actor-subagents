import type { Component, TuiMouseEvent } from "@earendil-works/pi-tui";

/** One header, one row per agent, then the swarm state. Pi supplies component-local coordinates. */
export function createRosterWidget(
	names: readonly string[],
	render: (width: number) => string[],
	open: (name: string) => void,
): Component {
	return {
		render,
		invalidate() {},
		handleMouse(event: TuiMouseEvent) {
			const name = names[event.y - 1];
			if (!name || event.button !== "left") return;
			// Handle the press as well so Pi owns the gesture and distinguishes a click from a drag.
			if (event.type === "click") open(name);
			if (event.type === "press" || event.type === "release" || event.type === "click")
				return { handled: true };
		},
	};
}
