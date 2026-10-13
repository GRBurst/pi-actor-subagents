import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createDemo } from "./demo.ts";

test("the demo uses real routing, a child reviewer, and an explicitly paused researcher", async () => {
  const engine = await createDemo();
  assert.equal(engine.get("reviewer")?.spawnedBy, "implementer");
  assert.equal(engine.status(engine.get("implementer")!).kind, "working");
  assert.equal(engine.get("implementer")?.currentTool, "bash");
  assert.deepEqual(engine.pausedAgents(), ["researcher"]);
  const traffic = engine.getMessageMatrix();
  assert.equal(traffic.implementer?.reviewer, 1);
  assert.equal(traffic.reviewer?.implementer, 1);
  const messages = JSON.stringify(engine.get("reviewer")?.view?.getMessages());
  assert.match(messages, /never writes files/);
  assert.match(messages, /send_message/);
  assert.match(messages, /move mkdir behind the dry-run guard/);
  assert.ok(engine.get("reviewer")?.view?.getToolDefinition?.("send_message"));
});

test("the README image retains editable text, not a raster screenshot", () => {
  const svg = readFileSync("docs/subagents.svg", "utf8");
  assert.match(svg, /<svg\b/);
  assert.match(svg, /<text\b/);
  assert.match(svg, /font-family="monospace"/);
  assert.match(svg, /subagents/);
  assert.match(svg, /implementer/);
  assert.match(svg, /reviewer/);
  assert.match(svg, /researcher/);
  assert.match(svg, /send_message/);
  assert.doesNotMatch(svg, /<image\b|<script\b|<foreignObject\b/);
});
