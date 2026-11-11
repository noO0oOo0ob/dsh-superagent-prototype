---
name: create-expert
description: Create or adapt a Personal Agent expert package with AGENTS, SOUL, routing descriptions, skills and optional MCP tools. Use when the user asks to add an expert, specialize Workers, or convert a Claude Code or Codex plugin.
---

# Create an expert package

Use the local template in `assets/travel-planner/` as a working example, replacing the travel content with the requested specialty. Write into the user’s selected directory; do not overwrite an existing package without inspecting it.

Keep two distinct instruction resources:
- `AGENTS.md`: responsibilities, methods, checks and scenario-specific reply forms.
- `SOUL.md`: personality, tone, interaction and uncertainty handling.

Define delivery defaults and exceptions in AGENTS.md, or in the package-relative file referenced by `output.guidance` (whose contents are appended to AGENTS), keeping one home for the rules. Cover discussion, execution and revision: a coding expert explains designs inline but writes requested source changes; a writing expert shows usable copy inline but creates requested exports. Do not require files merely for long or complex answers. The shared `dsh-super-personal-agent-reply-presentation` Skill supplies optional formatting guidance; do not preload or duplicate it. The host adds expert attribution, so the package must not require a signature.

Both must contain meaningful text. Keep operational task reporting and publication tools authoritative; expert instructions must not invent delivery destinations, override source identity, change permissions, or require direct IM sending.

A package needs a supported manifest: `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, or portable root `plugin.json` with the Agent Plugins 1.0 schema. Multiple manifests can share resources; import the intended format explicitly. The template contains matching Claude and Codex manifests. Keep their name and description consistent.

Configure our extension in `personal-agent.yaml`:
- `schemaVersion: 1`.
- `instructions.agents` and `instructions.soul`: contained relative files.
- `routing.description`: specific tasks this expert handles, not a claim to handle everything.
- `routing.examples`: representative requests. Include `routing.exclusions` where adjacent specialties might be confused.
- `entry.preloadSkills`: names of packaged skills needed in every task; other skills remain lazy.

Write realistic routing examples covering a positive request, an adjacent but unrelated request, and a follow-up to an existing task. No match must remain valid: Router uses a general Worker. An explicit user request for an unavailable expert should be explained, not silently replaced.

Skills use `skills/<name>/SKILL.md` with name and description frontmatter. Put long references under each skill’s directory and link them relative to that skill. Do not preload every reference. Keep scripts self-contained; source imports reject symlinks and omit node_modules and .git.

For MCP, declare verified stdio or HTTP endpoints using the source format. Use environment references for credentials, never paste secrets into the package. Unsupported hooks, app bindings, execution fields and authentication extensions appear as compatibility issues and prevent activation; do not erase a required feature to make validation pass.

Use **Settings → Expert packages** to preview the package. Verify the actual AGENTS, SOUL, defaults, skills and compatibility issues. Save the snapshot, then enable it when requested. Importing or refreshing never changes already accepted tasks. Report the output directory, supported format, intended routing behavior and any missing credentials or dependencies.

Do not claim semantic routing or real MCP delivery was tested merely because a manifest parsed. Exercise the supplied scenarios through the available test environment, or explicitly identify the remaining manual checks.
