/** Scripted example data rendered by the real panel; this extension makes no model requests. */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { makeAgentTools } from "../extensions/actor-subagents/agent-tools.ts";
import { toCustomAgentMessage } from "../extensions/actor-subagents/agent-message.ts";
import { Engine } from "../extensions/actor-subagents/engine.ts";
import { createSubagentsPanel } from "../extensions/actor-subagents/panel.ts";

const timestamp = Date.UTC(2026, 0, 1, 12);
const usage = {
  input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

export async function createDemo() {
  const engine = new Engine({ maxAgents: 8, maxSpawnDepth: 3 });
  const transcripts = new Map<string, unknown[]>();
  // KISS: real orchestration and renderers, fixed session data instead of an API-dependent demo.
  const unavailable = async (): Promise<never> => { throw new Error("This demo has no model sessions"); };
  const tools = makeAgentTools("reviewer", {
    engine, spawnAgent: unavailable, setAgentModel: unavailable, resumeAgents: unavailable,
    persistRoster: () => {}, updateStatus: () => {},
  });
  for (const [name, parent, model, tokens, level] of [
    ["main", "main", "anthropic/claude-sonnet-4-6", 0, "medium"],
    ["implementer", "main", "anthropic/claude-sonnet-4-6", 9400, "medium"],
    ["reviewer", "implementer", "openai/gpt-5.4", 6200, "high"],
    ["researcher", "main", "anthropic/claude-haiku-4-5", 2800, "low"],
  ] as const) {
    const messages: unknown[] = [];
    transcripts.set(name, messages);
    engine.addAgent({
      name, spawnedBy: parent, depth: name === "main" ? 0 : parent === "main" ? 1 : 2,
      model, thinkingLevel: level, createdAt: timestamp, turns: 1, lastActivity: timestamp,
      handle: {
        deliver: async (message) => { messages.push({ role: "custom", ...toCustomAgentMessage(message), timestamp }); },
        deliverUser: async (text) => { messages.push({ role: "user", content: text, timestamp }); },
        abort: async () => {},
      },
      view: {
        getMessages: () => messages,
        getContextUsage: () => ({ tokens, contextWindow: 200000, percent: tokens / 2000 }),
        getToolDefinition: (toolName) => tools.find((tool) => tool.name === toolName),
        subscribe: () => () => {},
      },
    });
  }
  await engine.route("main", "implementer", "Add --dry-run. Ask a reviewer to check the patch.");
  await engine.route("implementer", "reviewer", "Review the dry-run patch. Check that it never writes files.");
  const messages = transcripts.get("reviewer")!;
  const reply = "Found one edge case: --dry-run must skip creating the output directory too.";
  messages.push({
    role: "assistant", content: [{ type: "text", text: reply }],
    api: "openai-responses", provider: "openai", model: "gpt-5.4", usage, stopReason: "stop", timestamp,
  });
  messages.push({
    role: "assistant", content: [{ type: "toolCall", id: "review-note", name: "send_message",
      arguments: { to: ["implementer"], content: "Please move mkdir behind the dry-run guard." } }],
    api: "openai-responses", provider: "openai", model: "gpt-5.4", usage, stopReason: "toolUse", timestamp,
  });
  await engine.route("reviewer", "implementer", "Please move mkdir behind the dry-run guard.");
  messages.push({ role: "toolResult", toolCallId: "review-note", toolName: "send_message",
    content: [{ type: "text", text: "sent to implementer (bash)" }], isError: false, timestamp });
  engine.beginTurn("implementer");
  engine.setActivity("implementer", "tool", "bash");
  engine.setCustomStatus("implementer", "running tests");
  engine.setCustomStatus("reviewer", "review complete");
  engine.pause("user", ["researcher"]);
  return engine;
}

export default function demo(pi: ExtensionAPI) {
  pi.registerCommand("demo", {
    description: "Open the scripted README demo (no model calls)",
    handler: async (_args, ctx) => {
      const engine = await createDemo();
      await ctx.ui.custom<void>((tui, theme, kb, done) => {
        const panel = createSubagentsPanel({
          engine, cwd: ctx.cwd, hideThinking: true, toolsExpanded: false,
          setToolsExpanded: () => {}, listModels: () => [],
          setAgentModel: async () => ({ ok: false, msg: "This demo has no model sessions" }),
        }, tui, theme, kb as unknown as { matches(data: string, keybinding: string): boolean }, done);
        // Select the reviewer's real transcript and leave a human message drafted in the editor.
        panel.handleInput("\u001b[B");
        panel.handleInput("Please also check the empty-input case.");
        return panel;
      }, {
        overlay: true,
        overlayOptions: { anchor: "bottom-center", width: "100%", maxHeight: "50%" },
        onHandle: (handle: { focus(): void }) => handle.focus(),
      } as never);
    },
  });
}
