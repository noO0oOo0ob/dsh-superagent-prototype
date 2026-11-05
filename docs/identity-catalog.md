# Identity catalog

Open **Settings → Identities** to edit `agent.yaml`, `AGENTS.md` and `SOUL.md`, preview inheritance and save an immutable version. This is a configuration catalog: saving a version does not bind a bot, change Main, switch a Worker or enforce permissions. The existing prompt editor and running Sessions remain authoritative until runtime identity integration is delivered. [Host protection review](identity-protection-review.md) describes the prerequisite for protected activation.

## Sources and inheritance

`common` is the single root, created with empty instructions. Every other identity names one published parent. `agent.yaml` accepts only `id`, `name`, `parent`, `model`, `preset` and `capabilities`. IDs use lowercase letters followed by lowercase letters, digits or hyphens, up to 64 characters. `model` uses the existing `provider`, `model` and optional `reasoningEffort` selection. An omitted model or preset inherits; explicit `null` selects the DSH default. Capability names are `read`, `write`, `shell`, `web` and `delegate`; the preview intersects them with the parent's allowed set. These are intended settings, not active permission grants.

AGENTS.md describes responsibilities and methods; SOUL.md describes style. The preview retains source identity IDs, revisions and filenames. The configured prompt character budget bounds input files and inherited instruction text. Unknown fields, malformed YAML, missing parents and cycles are rejected. Role text does not modify project AGENTS.md files.

Each publication saves the exact files and its parent's already published ancestry. Updating `common` does not rewrite an existing parent or child. Publish each affected parent before publishing a child to adopt its new ancestry. The identity list marks newer ancestor versions. Preview hashes and base-revision checks reject concurrent edits or changed parents; preview again before publishing.

## Local draft exchange

Export writes the saved files to `stateDir/identity-drafts/<id>-v<revision>/` and records the export revision. Existing edited files are preserved and reported as a conflict. Exporting a newer version uses a separate directory. Import reads the last exported directory into the editor without publishing. A stale export or mismatched identity ID is rejected; compare old files with the latest publication before copying changes into the editor. Symbolic-link directories and files are rejected. This path validation is not an operating-system security boundary.

Editor drafts survive tab changes in sessionStorage. Imported or typed changes require a fresh preview and **Save new version**. Import is disabled while another editor draft is unsaved. No folder or Vault is scanned automatically, and identity files are not automatically exported into Obsidian.

## Persistence and compatibility

The catalog uses separately versioned KV records for identity heads, immutable publications and exported-draft revisions. Existing account IDs, prompt revisions, Threads, tasks, results and receipts are not migrated or reinterpreted. Files are editable copies; SQLite remains the catalog authority. Publications can be read by ID and revision through `GET personal/identities/:id?revision=N`.

Current Sessions still have the existing permissions. The catalog has not established a complete owner-only mutation guarantee across file, process and management paths; the existing DSH outer authentication remains in place. It must not contain private memory or credentials. Public-policy enforcement, Session bindings, confirmed personality proposals and confidential shared memory require the host support described in the review. The panel labels this limitation explicitly.
