# pi-actor-subagents

Long-lived agents for [Pi](https://pi.dev/): build arbitrary agent hierarchies where **every agent can message every other agent**, not just its parent or children. Keep agents around for follow-up work, inspect their conversations, and steer them directly. Saved agents survive Pi restarts when you reopen the same main session.

Pairs well with [pi-infinite-context](https://github.com/fdietze/pi-infinite-context) for long-running conversations.

## Install

```bash
pi install npm:pi-actor-subagents
```

## Subagents panel

![Subagents panel: an implementer running tests, its reviewer exchanging messages, and a paused researcher](docs/subagents.svg)

Select an agent to inspect its conversation and message it directly.

## Tools

| Tool | Purpose |
|---|---|
| `spawn_subagent` | Create a named agent with its own system prompt, initial task, model, and session. |
| `send_message` | Send a message to one or more agents, including parents, children, and peers. |
| `list_subagents`, `subagent_history` | Inspect agent state and conversations. |
| `set_subagent_model`, `set_status` | Change model or thinking level; report progress and ETA. |
| `pause_subagents`, `resume_subagents`, `kill_subagents` | Control owned agents and their descendants. |

`/subagents` opens the panel. `/subagents-pause`, `/subagents-resume`, and `/subagents-kill` control named subtrees; omit names to target your direct children.

All tool results in the main session and subagents include start/finish timestamps, giving agents a sense of elapsed time for progress updates and ETA estimates. If a start time is unavailable, only the finish time is shown.

## Configuration

Create `~/.pi/agent/actor-subagents/settings.json` (inside Pi's configured agent directory):

```json
{
  "maxAgents": 8,
  "maxSpawnDepth": 3,
  "childExtensions": [
    "/absolute/path/to/pi-infinite-context/extensions/infinite-context/index.ts"
  ]
}
```

`childExtensions` is the extension whitelist for every subagent. Children do not inherit Pi's discovered extensions; list the extension files or directories you want them to load. The default is no extra extensions. Actor-subagents' orchestration tools are always available and need no whitelist entry.

Whitelist changes apply to newly spawned agents; limits apply after restarting Pi. The values above are the default limits. See [settings](docs/settings.md) for details.

## Coordination

- **Handshake:** a new child is instructed to send its parent its understanding of the task and clarification questions, then wait for a `send_message` go-ahead before working. This is an agent protocol, not an enforced scheduling barrier.
- **Ownership:** every agent controls the agents it spawns and their descendants; messaging and inspection are open to all. `set_status` is for background agents.
- **Persistence:** reopening the same saved main session restores saved agents paused; resume them explicitly. Missing files or unavailable models can prevent restoration. Buffered messages, progress, and ETA are not saved.
