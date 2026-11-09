# Expert packages

Expert packages supply Worker instructions, Skills and MCP tools. They do not replace Sources, Threads, Tickets or message delivery. Main and IM routers read package summaries through `personal_agent_experts`; `expert: null` or omission accepts general work. Explicit selections contain the catalog ID, digest and reason. Existing tasks retain their selection. There is no keyword classifier and no claim that offline tests establish model routing accuracy.

## Import and activation

Open Settings → Expert packages. Choose an absolute local directory and preview it. Claude Code `.claude-plugin/plugin.json`, Codex `.codex-plugin/plugin.json` and Agent Plugins 1.0 root `plugin.json` are supported entry formats. Choose a format when Claude and Codex manifests coexist. Portable manifests take priority by default. Source files are never rewritten. Import saves a disabled snapshot; enable it explicitly after checking compatibility diagnostics. Refreshing saves another disabled revision and does not alter existing tasks.

Every effective expert has AGENTS and SOUL. Explicit extension paths take precedence over conventional files. A sole Claude agent body can supply AGENTS; multiple agents need `entry.agent`. Missing instructions use visible general templates. Editor overrides replace whole instruction resources. A new source preview detects changed files; stale publication and selection digests are rejected.

`personal-agent.yaml` accepts schemaVersion 1, instructions (agents/soul), routing (description/examples/exclusions), entry (agent/preloadSkills), execution.modelProfile, requirements.mcp and output.guidance. Paths stay inside the package. Source imports reject symlinks and special files and use configurable byte/file limits. Hooks, commands, app bindings, unsupported agent fields and unsupported MCP settings remain diagnostics that block activation. They are never silently executed or discarded. This is component compatibility, not emulation of every source client's execution behavior.

## Context and resources

Main keeps routing instructions and sees expert summaries, not all persona bodies. Worker requests contain the selected AGENTS and SOUL, configured preload Skill bodies, the existing task execution policy and mandate. Other Skills load lazily with package-relative resource roots. The Worker workspace remains independent from the expert resource directory, so repository AGENTS files retain their normal DSH loading behavior.

Tickets persist an optional `expert` binding with the exact normalized package, resource bytes and selection reason. Older Tickets have no binding and use general instructions. Task resume reads captured resources, not the mutable source directory. Modified materialized resources fail visibly. This storage change is additive; no old record is rewritten. Snapshot files are not an operating-system security boundary: existing full-access agents still require the separately reviewed host protection interfaces for stronger guarantees.

Supported MCP transports are stdio and Streamable HTTP. The bridge uses the installed DSH MCP client, distinct per-session server namespaces and scoped registrations. Root variables resolve to the snapshot; environment references resolve at connection time. Missing variables, unsupported configuration and connection failures fail visibly. Do not place literal credentials in packages; use environment references. Credential changes are not frozen in snapshots. Remote server contents and behavior are outside the package snapshot guarantee.

## Authoring

The `create-expert` Skill is registered in managed sessions. Its `assets/travel-planner` directory is a complete demo with matching Claude and Codex manifests, AGENTS, SOUL, a routing description and an itinerary Skill. Import it with an explicit format. It does not require credentials or make live IM calls.

The previous identity catalog remains independent and inactive during this migration. It is not loaded into expert Workers. The next migration step provides explicit export of existing identity instructions; no private memory or owner-only protection is implied by this release.
