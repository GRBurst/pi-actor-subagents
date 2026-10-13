# pi-actor-subagents

Named background agents for [Pi](https://pi.dev/): delegate work, exchange messages, inspect progress, and steer agents without leaving the main session.

## Install

```bash
pi install npm:pi-actor-subagents
```

![Subagents panel: an implementer running tests, its reviewer exchanging messages, and a paused researcher](docs/subagents.svg)

Select an agent to inspect its conversation and message it directly. The editable SVG is a scripted demo captured from the real panel.

## Tools

| Tool | Purpose |
|---|---|
| `spawn_subagent` | Create a named background agent with its own prompt, model, and session. |
| `send_message` | Send a message to one or more agents. Ordinary replies do not route themselves. |
| `list_subagents`, `subagent_history` | Inspect agent state and conversations. |
| `set_subagent_model`, `set_status` | Change model or thinking level; report progress and ETA. |
| `pause_subagents`, `resume_subagents`, `kill_subagents` | Control owned agents and their descendants. |

`/subagents` opens the panel. `/subagents-pause`, `/subagents-resume`, and `/subagents-kill` control named subtrees; omit names to target your direct children.

## Reminders

- Every agent owns the agents it spawns and their descendants. Messaging and inspection are open to all agents; `set_status` is for background agents only.
- Reopening the same file-backed main session attempts to restore saved agents paused. Resume explicitly; restoration is not guaranteed. Buffered messages, progress, and ETA are not saved.
- Pause requests abort running work but cannot undo side effects. After interrupted work, inspect actual state before retrying an action.

Optional limits and child extensions: [settings](docs/settings.md).
