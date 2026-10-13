# Settings

Optional file: `~/.pi/agent/actor-subagents/settings.json` (inside Pi's configured agent directory).

```json
{
  "maxAgents": 8,
  "maxSpawnDepth": 3,
  "childExtensions": ["/absolute/path/to/an/extension"]
}
```

`maxAgents` limits live background agents; `maxSpawnDepth` limits their spawn-tree depth. Each must be a positive integer. Missing or invalid values use the defaults above. Limits take effect at the next Pi start.

`childExtensions` explicitly grants children extra extensions. It accepts only non-empty string paths; a missing, unreadable, malformed, or invalid file grants none. Changes apply to the next spawn. Actor-subagents itself is unnecessary: children already receive the orchestration tools.

For persistence and recovery contracts, see [DESIGN.md](../DESIGN.md).
