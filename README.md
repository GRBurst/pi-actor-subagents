# pi-actor-subagents

A [pi](https://pi.dev/) extension for persistent actor-style subagent swarms. It lets a foreground agent delegate work to named background agents, route messages through a spawn tree, inspect their state and history, pause, resume or kill the agents they own, and restore saved agents with their sessions.

## Install

```bash
pi install git:github.com/fdietze/pi-actor-subagents
```

## Interface

Every agent receives `spawn_subagent`, `send_message`, `set_subagent_model`, `list_subagents`, `subagent_history`, `set_status`, `pause_subagents`, `resume_subagents`, and `kill_subagents` (`set_status` is for background agents only). An agent pauses, resumes and kills only the agents it spawned and their descendants, and retunes those or itself; `main` owns them all. Messaging and inspection are open to everyone; ordinary agent replies can be read in history and the panel, but only `send_message` actively routes them to peers. Lifecycle notices are best-effort, silent transcript appends to eligible direct parents, not wake-ups or guaranteed notifications. Tables show short statuses (`paused`, `error`); history, delivery results and the selected-agent panel line explain pauses, while history and the selected-agent line also show error reasons. Child agents receive the orchestration tools through pi's `customTools`; actor-subagents is not recursively loaded as a child extension.

The interactive UI shows a compact roster and provides:

- `/subagents` — open the swarm panel; its input box messages the selected agent as you
- `/subagents-pause` and `/subagents-resume` — request pause or resume by name, each with its subtree (no name = `main`'s direct children; a lower pause stays). Pause requests abort running work; abort completion can lag behind the result and cannot undo side effects.
- `/subagents-kill` — terminate agents by name, each with its subtree (no name = all)

For file-backed main sessions, subagent membership and transcripts are stored beside the session under `subagents/<main-session-id>/`. Reopening the same main session attempts to restore saved agents paused; resume them explicitly. Missing files, unavailable models or reopen failures can leave agents unrestored, and roster write failures are not reported. A new or in-memory main session does not restore that swarm. Buffered messages, queued notices, custom status and ETA are not persisted. Resume does not replay interrupted tools: a missing result means the action's outcome is unknown, so the agent is instructed to check actual state before retrying side effects. Provider compatibility and recovery limits are documented in [DESIGN.md](DESIGN.md#interrupted-work).

## Settings

Optional, at `~/.pi/agent/actor-subagents/settings.json` (inside pi's agent directory):

```json
{
  "maxAgents": 8,
  "maxSpawnDepth": 3,
  "childExtensions": [
    "/absolute/path/to/an/extension"
  ]
}
```

`maxAgents` and `maxSpawnDepth` are the swarm's limits: background agents alive at once and spawn-tree depth. The values above are the defaults. Each value must be a positive integer; anything else (including `0`) falls back to that key's default on its own, so a partial file is fine. New limits take effect when pi next starts.

`childExtensions` grants child sessions extra pi extensions; loading is explicit and fail-closed. Only non-empty string entries are accepted, and anything else — a missing, unreadable, malformed, or invalid file — grants none. Changes apply to the next spawned agent. Do not list actor-subagents itself: children already receive its orchestration tools directly.

## Development

```bash
nix develop
npm ci
npm run ci
npm pack --dry-run
```

Architecture and compatibility contracts are documented in [DESIGN.md](DESIGN.md).

## License

[MIT](LICENSE)
