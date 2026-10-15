import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { TuiAltScreen, stripTerminalSequences, visibleWidth, type Terminal, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { Engine } from "./engine.ts";
import { createSubagentsPanel } from "./panel.ts";
import { createRosterWidget } from "./roster-widget.ts";

const mouse = (type: TuiMouseEvent["type"], x: number, y: number, extra: Partial<TuiMouseEvent> = {}): TuiMouseEvent => ({
	type, button: "left", x, y, screenX: x, screenY: y, width: 100, height: 30,
	shift: false, alt: false, ctrl: false, ...extra,
});

function fixture(initialAgent?: string, tui = { requestRender() {}, terminal: { rows: 30, columns: 100 } }, done = () => {}) {
	const engine = new Engine({ maxAgents: 8, maxSpawnDepth: 3 });
	for (const [createdAt, name] of ["main", "alpha", "beta"].entries()) {
		engine.addAgent({
			name, spawnedBy: "main", depth: name === "main" ? 0 : 1, createdAt, turns: 0, lastActivity: 0,
			model: "test/model", handle: { deliver: async () => {}, abort: async () => {} },
			view: { getMessages: () => [], getContextUsage: () => undefined, subscribe: () => () => {} },
		});
	}
	const retuned: string[] = [];
	const panel = createSubagentsPanel({
		engine, cwd: process.cwd(), initialAgent, hideThinking: true, toolsExpanded: false,
		setToolsExpanded() {}, listModels: () => ["test/model", "test/other"],
		setAgentModel: async ({ name }) => { retuned.push(name); return { ok: true, msg: "retuned" }; },
	}, tui, {
		fg: (_color, text) => text,
		bg: (color, text) => color === "selectedBg" ? `\x1b[7m${text}\x1b[27m` : text,
	}, { matches: (data, binding) => data === "model" && binding === "app.model.cycleForward" }, done);
	return { engine, panel, retuned };
}

const selected = (panel: ReturnType<typeof createSubagentsPanel>, name: string) =>
	panel.render(100).some((line) => line.startsWith("\x1b[7m") && line.includes(name));

test("panel opens on the requested agent, with a first-row fallback", () => {
	for (const [requested, expected] of [["beta", "beta"], ["gone", "alpha"], [undefined, "alpha"]]) {
		const { panel, retuned } = fixture(requested);
		assert.ok(selected(panel, expected!));
		panel.handleInput("model");
		assert.deepEqual(retuned, [expected]);
	}
});

test("panel row clicks select agents, not presses, drags, or secondary clicks", () => {
	const { panel, retuned } = fixture();
	panel.render(100);
	for (const type of ["press", "drag", "release"] as const) panel.handleMouse(mouse(type, 2, 2));
	panel.handleMouse(mouse("click", 2, 2, { button: "right" }));
	assert.ok(selected(panel, "alpha"));
	panel.handleMouse(mouse("click", 2, 2));
	assert.ok(selected(panel, "beta"));
	panel.handleInput("model");
	assert.deepEqual(retuned, ["beta"]);
	panel.handleInput("\x1b[A");
	assert.ok(selected(panel, "alpha"), "keyboard navigation still works");
});

test("selection follows agent identity and a click follows the last rendered roster", async () => {
	const { engine, panel } = fixture("beta");
	panel.render(100); // alpha, beta
	await engine.route("main", "beta", "traffic reorders beta before alpha");
	// The user still sees the old frame: row 1 is alpha, even though beta now sorts first.
	panel.handleMouse(mouse("click", 2, 1));
	assert.ok(selected(panel, "alpha"));
	await engine.route("main", "beta", "more traffic");
	assert.ok(selected(panel, "alpha"), "reordering must not change the selected agent");
});

test("the fallback selection stays on its identity when traffic reorders the first row", async () => {
	for (const requested of [undefined, "gone"]) {
		for (const clickFirst of [false, true]) {
			const { engine, panel, retuned } = fixture(requested);
			assert.ok(selected(panel, "alpha"));
			if (clickFirst) panel.handleMouse(mouse("click", 2, 1));
			await engine.route("main", "beta", "reorder beta before alpha");
			assert.ok(selected(panel, "alpha"));
			panel.handleInput("model");
			assert.deepEqual(retuned, ["alpha"]);
		}
	}
});

test("removing the selected agent rebinds its streaming subscription to the fallback", async () => {
	const { engine, panel, retuned } = fixture("beta");
	const subscriptions: string[] = [];
	for (const name of ["alpha", "beta"]) {
		const record = engine.get(name)!;
		record.view = {
			...record.view!,
			subscribe: () => {
				subscriptions.push(`bind ${name}`);
				return () => { subscriptions.push(`unbind ${name}`); };
			},
		};
	}
	panel.render(100);
	await engine.kill("user", ["beta"]);
	assert.ok(selected(panel, "alpha"));
	assert.deepEqual(subscriptions, ["bind beta", "unbind beta", "bind alpha"]);
	panel.handleInput("model");
	assert.deepEqual(retuned, ["alpha"]);
	panel.handleInput("\x1b");
	assert.equal(subscriptions.at(-1), "unbind alpha");
});

test("native wheel deltas scroll the selected transcript without changing selection", () => {
	const { engine, panel } = fixture("beta");
	engine.get("beta")!.view!.getSystemPrompt = () => Array.from({ length: 60 }, (_, i) => `prompt line ${i}`).join("\n");
	const before = panel.render(100);
	assert.ok(before.some((line) => line.includes("prompt line 59")));
	panel.handleMouse(mouse("wheel", 50, 8, { wheelDelta: -4 }));
	const after = panel.render(100);
	assert.ok(!after.some((line) => line.includes("prompt line 59")));
	assert.ok(selected(panel, "beta"));
});

test("Esc occupies the rightmost header cells and closes by click or keyboard", () => {
	let closed = 0;
	const { panel } = fixture(undefined, undefined, () => { closed++; });
	for (const width of [3, 8, 40, 100]) {
		const header = stripTerminalSequences(panel.render(width)[0]!);
		assert.equal(visibleWidth(header), width);
		assert.ok(header.endsWith("Esc"));
	}
	panel.handleMouse(mouse("click", 96, 0));
	panel.handleMouse(mouse("click", 99, 1));
	panel.handleMouse(mouse("click", 99, 0, { button: "right" }));
	assert.equal(closed, 0);
	panel.handleMouse(mouse("click", 97, 0));
	assert.equal(closed, 1);
	const other = fixture(undefined, undefined, () => { closed++; }).panel;
	other.handleInput("\x1b");
	assert.equal(closed, 2);
});

test("installed Pi dispatches real mouse reports to roster rows and the overlay Esc label", async (t) => {
	let input!: (data: string) => void;
	const noop = () => {};
	const terminal: Terminal = {
		columns: 100, rows: process.stdout.rows ?? 30, kittyProtocolActive: false,
		start: (onInput) => { input = onInput; }, stop: noop, drainInput: async () => {}, write: noop,
		moveBy: noop, hideCursor: noop, showCursor: noop, clearLine: noop, clearFromCursor: noop,
		clearScreen: noop, setTitle: noop, setProgress: noop, setProgramStatus: noop,
	};
	const tui = new TuiAltScreen(terminal);
	t.after(() => tui.stop());
	const frame = async () => { tui.requestRender(true); await setImmediate(); };
	let opened: string | undefined;
	const roster = createRosterWidget(["alpha", "beta"], () => ["subagents", "alpha", "beta", "state"], (name) => {
		opened = name;
	});
	tui.addChild(roster);
	tui.start();
	await frame();
	const betaRow = tui.getScreenLines().findIndex((line) => stripTerminalSequences(line).trim() === "beta");
	assert.ok(betaRow >= 0);
	const report = (suffix: "M" | "m", x: number, y: number, button = 0) => input(`\x1b[<${button};${x + 1};${y + 1}${suffix}`);
	report("M", 2, betaRow);
	assert.equal(opened, undefined, "press alone does not open the panel");
	report("M", 3, betaRow, 32);
	report("m", 3, betaRow);
	assert.equal(opened, undefined, "dragging a roster row does not open the panel");
	report("M", 2, betaRow);
	report("m", 2, betaRow);
	assert.equal(opened, "beta");

	let closed = false;
	const { panel } = fixture(opened, tui, () => { closed = true; overlay.hide(); });
	const overlay = tui.showOverlay(panel, { anchor: "bottom-center", width: "100%", maxHeight: "50%" });
	overlay.focus();
	await frame();
	const headerRow = tui.getScreenLines().findIndex((line) => stripTerminalSequences(line).endsWith("Esc"));
	assert.ok(headerRow >= 0);
	report("M", 98, headerRow);
	report("m", 98, headerRow);
	assert.equal(closed, true);
});
