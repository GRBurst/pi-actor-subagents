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
  for (const [name, model, effort] of [
    ["implementer", "anthropic/claude-sonnet-5-5", "high"],
    ["reviewer", "openai-codex/gpt-6.1-sol", "high"],
    ["researcher", "anthropic/claude-sonnet-5-5", "medium"],
  ] as const) {
    assert.equal(engine.get(name)?.model, model);
    assert.equal(engine.get(name)?.thinkingLevel, effort);
  }
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

test("the SVG limits the bash badge and fills entire message backgrounds", () => {
  const svg = readFileSync("docs/subagents.svg", "utf8");
  const theme = JSON.parse(readFileSync("scripts/tokyo-night.json", "utf8"));
  const width = Number(/<svg width="([\d.]+)"/.exec(svg)?.[1]);
  const rectangles = [...svg.matchAll(/<rect\b([^>]+)\/>/g)].map((match) => {
    const attributes = Object.fromEntries([...match[1]!.matchAll(/([\w]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]));
    return { fill: attributes.fill, x: parseFloat(attributes.x!), y: parseFloat(attributes.y!),
      width: parseFloat(attributes.width!), height: parseFloat(attributes.height!) };
  });
  const texts = [...svg.matchAll(/<text\b[^>]*y="([\d.]+)px"[^>]*>(.*?)<\/text>/gs)].map((match) => ({
    y: Number(match[1]), text: match[2]!.replace(/<[^>]*>/g, ""),
  }));
  const backgrounds = (text: string, fill: string) => {
    const row = texts.find((line) => line.text.includes(text));
    assert.ok(row, `missing demo text: ${text}`);
    return rectangles.filter((rect) => rect.fill === fill && rect.y < row.y && rect.y + rect.height > row.y);
  };
  const badge = backgrounds("implementer bash", theme.colors.toolSuccessBg);
  assert.equal(badge.length, 1);
  assert.ok(badge[0]!.width < 60, "only the four-character bash label should be highlighted");
  const assertFullBackground = (text: string, fill: string) => {
    // Attribute changes can split a solid background into adjacent SVG rectangles.
    const segments = backgrounds(text, fill).filter((rect) => rect.width > 0).sort((a, b) => a.x - b.x);
    assert.ok(segments.length, `missing message background: ${text}`);
    let end = segments[0]!.x;
    for (const segment of segments) {
      assert.ok(segment.x <= end + 0.01, `gap in message background: ${text}`);
      end = Math.max(end, segment.x + segment.width);
    }
    assert.ok(end - segments[0]!.x > width * 0.9, `incomplete message background: ${text}`);
  };
  for (const text of ["from implementer", "Review the dry-run patch."]) {
    assertFullBackground(text, theme.colors.customMessageBg);
  }
  for (const text of ["send_message", "content:", "Please move mkdir", "sent to implementer"]) {
    assertFullBackground(text, theme.colors.toolSuccessBg);
  }
});
