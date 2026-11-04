# Local Vault exports

Super personal agent projects immutable task result snapshots into a configured local Markdown directory. Obsidian can open the files directly; it does not need to run while exports are written. SQLite remains the task, metadata, scheduling, and delivery store. Editing a generated note does not alter a task or submit another model request.

## Configuration

The personal configuration contains a `vault` object. Its defaults are `{ "enabled": false, "root": "", "directory": "Personal Agent" }`. Set `enabled` to `true` and `root` to an existing absolute Vault directory to enable exports. `directory` is a relative subdirectory without empty, parent, or current-directory segments; its default keeps exports under `Personal Agent/Results/`. No credentials, Obsidian plugin, GitHub repository, or Git remote are required.

```json
{
  "vault": {
    "enabled": false,
    "root": "",
    "directory": "Personal Agent"
  }
}
```

Choose the actual Vault path before enabling this setting. No production Vault is preconfigured. Tests use temporary directories and never read or modify a personal Vault. Exporting existing results requires explicitly enqueueing those snapshots; enabling exports does not scan a Vault or retroactively export all history.

## Files and identities

Each result has one stable filename, the SHA-256 hash of its result ID plus `.md`. Titles do not control paths. Frontmatter stores `personal_agent.schema: 1`, result, task and assignment IDs, the report timestamp and state, title, local result URL, and the complete list of stable context, trace and trigger references. Values use JSON serialization, which is valid YAML and prevents newlines or quotes in titles from introducing new frontmatter fields. Account credentials, raw source payloads, and arbitrary metadata are not copied into notes.

The Markdown body contains the result title and summary. A new result produces a new file. The export receipt includes its local file path and `obsidian://open?path=…` link. This desktop-local link is useful in DSH on the host; an IM client on another device cannot use the host filesystem path without its own synchronization and path mapping.

## Publication and recovery

An export intent freezes the Markdown content and configured destination before filesystem work begins. Its durable status is `pending`, `written`, `unchanged`, or `preserved`. `preserved` means a different file already occupies the intended path; the existing file remains untouched and the receipt exposes its location for review. It is a completed preservation outcome, not an instruction to overwrite on retry.

Publication creates a temporary file beside the destination, flushes it, and links it into place with an atomic exclusive operation. An existing destination is never replaced. Equal bytes produce `unchanged`; other regular-file contents produce `preserved`. A restart after publication but before receipt persistence safely recognizes the complete file on retry. Ordinary failures remove their temporary file; process termination may leave a hidden `.tmp` file that can be inspected and removed after the process exits.

Root and descendant directory symlinks, symlink output files, non-directory path components, and malformed stored paths are rejected. Configured system parent aliases such as macOS `/var` are resolved to their canonical path; the Vault root itself must not be a symlink. The canonical root is bound on the first attempt and checked again before publication. These checks assume a local filesystem without another process maliciously replacing directories during filesystem operations; they are not a sandbox against a hostile filesystem administrator.

Filesystem failures are recorded on the export receipt and rethrown to the export effect for independent retry. They neither rerun the worker nor prevent Main Session or IM result delivery. Disabling exports pauses pending publication. Changing the configured destination does not redirect a pending intent: restore its original configuration to resume it, or explicitly enqueue the result for the new destination. Moving a completed note does not change its stored receipt.

## Runtime integration

The runtime constructs `Vault(store, () => personal.view().config.vault)`. While recording a new result, call `vault.enqueue(result)` in the same SQLite transaction; if it returns an intent, enqueue a separate durable `vault` effect keyed by the intent ID. The handler calls `vault.publish(id)`. Register that handler before the effect runner starts. Do not put publication inside the existing result-delivery effect: disk failures must remain independent of notifications.

Expose `vault.list(resultId)` with task/result details so users can see preservation and failure states and open a completed note. The queued intent contains no mutable task lookup; retries always publish the originally captured content. The existing effect scheduler owns attempts and retry timing. No Vault watcher or implicit note-to-task ingestion is installed: a future note Source needs an explicit Inbox directory and its own stable message identities, admission policy and archival rules.
