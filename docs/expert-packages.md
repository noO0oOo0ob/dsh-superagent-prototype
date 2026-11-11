# Expert packages

Expert packages supply Worker instructions, Skills and MCP tools. They do not replace Sources, Threads, Tickets or message delivery. Main and IM routers read package summaries through `personal_agent_experts`; `expert: null` or omission accepts general work. Explicit selections contain the catalog ID, digest and reason. Existing tasks retain their selection. There is no keyword classifier and no claim that offline tests establish model routing accuracy.

## Import and activation

Open Settings → Expert packages. Choose an absolute local directory and preview it. Claude Code `.claude-plugin/plugin.json`, Codex `.codex-plugin/plugin.json` and Agent Plugins 1.0 root `plugin.json` are supported entry formats. Choose a format when Claude and Codex manifests coexist. Portable manifests take priority by default. Source files are never rewritten. Import saves a disabled snapshot; enable it explicitly after checking compatibility diagnostics. Refreshing saves another disabled revision and does not alter existing tasks.

Every effective expert has AGENTS and SOUL. Explicit extension paths take precedence over conventional files. A sole Claude agent body can supply AGENTS; multiple agents need `entry.agent`. Missing instructions use visible general templates. Editor overrides replace whole instruction resources. A new source preview detects changed files; stale publication and selection digests are rejected.

`personal-agent.yaml` accepts schemaVersion 1, instructions (agents/soul), routing (description/examples/exclusions), entry (agent/preloadSkills), execution.modelProfile, requirements.mcp/optionalMcp and output.guidance. Paths stay inside the package. Source imports reject symlinks and special files and use configurable byte/file limits. Hooks, commands, app bindings, unsupported agent fields and unsupported MCP settings remain diagnostics that block activation. They are never silently executed or discarded. This is component compatibility, not emulation of every source client's execution behavior.

## Context and resources

Main keeps routing instructions and sees expert summaries, not all persona bodies. Worker requests contain the selected AGENTS and SOUL, configured preload Skill bodies, the existing task execution policy and mandate. Other Skills load lazily with package-relative resource roots. The Worker workspace remains independent from the expert resource directory, so repository AGENTS files retain their normal DSH loading behavior.

Tickets persist an optional `expert` binding with the exact normalized package, resource bytes and selection reason. Older Tickets have no binding and use general instructions. Task resume reads captured resources, not the mutable source directory. Modified materialized resources fail visibly. This storage change is additive; no old record is rewritten. Snapshot files are not an operating-system security boundary: existing full-access agents still require the separately reviewed host protection interfaces for stronger guarantees.

Supported MCP transports are stdio and Streamable HTTP. The bridge uses the installed DSH MCP client, distinct per-session server namespaces and scoped registrations. Root variables resolve to the snapshot; environment references resolve at connection time. Missing variables and required server connection failures fail the Worker startup visibly. Declared optional MCP failures are logged and explicitly included in Worker context; unavailable tools are not advertised. Unsupported configuration blocks package activation. Do not place literal credentials in packages; use environment references. Credential changes are not frozen in snapshots. Remote server contents and behavior are outside the package snapshot guarantee.

## Authoring

The `create-expert` Skill is registered in managed sessions. Its `assets/travel-planner` directory is a complete demo with matching Claude and Codex manifests, AGENTS, SOUL, a routing description and an itinerary Skill. Import it with an explicit format. It does not require credentials or make live IM calls.

## Conversation identity and selection

Settings → Expert packages includes Main AGENTS/SOUL. Changes apply at Main's next turn. Message center → Bot settings → Expert configures that bot's conversational AGENTS/SOUL and allowed/default/fixed experts. Conversation instructions are frozen per IM Session; use `/new` to adopt changes. Routing admission uses current source preferences for each new task. Automatic mode can always select no expert, including when a default is set. Fixed mode requires the configured enabled expert and fails visibly if unavailable. Other channels and bots remain independent.

The summary tool accepts the candidate `trigger_id`; Main must supply it to see that Source's permitted experts. IM tools resolve and authorize the current conversation automatically. Both acceptance paths validate catalog state and source restrictions again after model preflight. Existing Ticket continuations retain their exact package. Selection is a semantic model decision, while availability, digest and source authorization are deterministic checks.

Settings → Legacy identities is read-only. Explicit migration exports published AGENTS/SOUL ancestry into a disabled expert package; it leaves identity history intact. Legacy model, preset and capability settings require explicit review instead of silently becoming active privileges. See [Identity archive](identity-catalog.md). No private memory or owner-only protection is implied.

## Reply forms and result authors

An expert stays bound to its Ticket across discussion, execution and follow-ups. Define default reply forms and exceptions in AGENTS.md or the package-relative file referenced by `output.guidance`, not both. User-requested formats take priority. Writing and comparisons normally publish usable Markdown text, including tables and links; coding execution writes source files, while coding discussion answers inline. Files suit explicit exports, documents or work products, not task complexity alone. `summary` remains internal reporting; `publication.blocks` carries the answer.

Managed sessions discover `dsh-super-personal-agent-reply-presentation` without preloading its body. A team Skill named `reply-presentation` overrides the bundled guidance without duplicate registration. Load it when substantial comparisons, long answers or mixed media need presentation guidance. The expert-creation workflow and travel example demonstrate these defaults. Imported expert snapshots and existing Tickets are not rewritten; edit and refresh packages explicitly for future tasks. Saved team communication/delivery sections and runtime overrides retain their text: review old file-only or one-sentence policies in prompt settings when upgrading.

New published result snapshots capture `attribution` separately from content: expert ID, display name and package digest, or an explicit general-assistant identity. This additive optional field is also carried by outbound messages and delivery records. Historical results without it remain unsigned; no stored generation or receipt is rewritten. Result publication uses captured identity, not the current catalog. Main and source deliveries append one bilingual author footer per complete publication, after its content and links. Rich delivery adds it to the last Markdown text block when space permits, otherwise as a final text block. Retries retain the first payload, and reading or forwarding the same saved result does not select a new author. Main's own conversation replies are not labeled as expert work. Media previews in Main retain the existing renderer behavior.

## Bundled general experts

The plugin ships five portable packages under `experts/`: `builtin-research` (研究分析), `builtin-writing` (写作表达), `builtin-software` (软件工程), `builtin-data` (数据分析), and `builtin-planning` (规划执行). Each has AGENTS, SOUL and three task-specific Skills. All Skills load lazily; Main reads catalog descriptions rather than every expert's instructions. The shared reply-presentation Skill remains available. These packages do not pin models, add MCP servers, schedule work or grant execution permissions.

Plugin startup installs and enables only missing bundled IDs, including when upgrading an existing installation. Packages are validated before any additions are saved. Existing catalog entries with those IDs, including edited or disabled ones, are preserved, as are account allowlists and fixed-expert settings. No-match selection still uses the general Worker. Installed snapshots do not automatically follow later bundled edits: preview and refresh the package explicitly for future tasks. Existing Tickets retain their captured instructions and Skills.

Research centers on sources and evidence; data analysis centers on datasets and calculations; planning turns a chosen goal into steps and schedules. Software owns concrete repository work; writing owns audience and expression. Specialists answer ordinary follow-ups within their existing Ticket rather than switching experts. Writing, research and discussion publish usable text, tables and links; code execution writes source files, and documents or exports are created when needed. Images use image publication blocks. Formatting alone never selects an expert.
