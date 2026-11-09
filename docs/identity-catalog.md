# Identity archive

Settings → Legacy identities displays the original `agent.yaml`, `AGENTS.md` and `SOUL.md` publications read-only. These records are not active Worker instructions. New Worker configuration belongs to [Expert packages](expert-packages.md); Main and bot conversation personas have separate settings.

## Explicit migration

Choose a published identity and migrate it. The migration flattens its exact published ancestry into separate AGENTS and SOUL resources with source headings. Empty instructions receive visible general defaults. It exports a Codex-compatible directory under `stateDir/legacy-expert-drafts/<id>-v<revision>/` and imports a disabled package. Review that package before enabling it. Existing files or expert IDs are never overwritten.

Legacy model, preset and capability settings are not activated by migration. Review the original `agent.yaml` and configure supported expert settings explicitly. A failed export may leave a draft directory for inspection; it is not silently deleted. No Vault is scanned and nothing is automatically exported to Obsidian.

## Persistence and limitations

The original versioned identity heads, publications and draft revisions remain intact, including captured parent ancestry. Read APIs retain publication-by-revision access. Existing write APIs remain for compatibility, but the product editor is retired. Account IDs, Threads, tasks, delivery receipts and prompt revisions are not rewritten.

Current Sessions retain their existing permissions. Expert snapshots and persona settings do not guarantee owner-only mutation or confidential memory. The [host protection review](identity-protection-review.md) remains the prerequisite for those guarantees. Do not store credentials or private shared memory in these resources.
