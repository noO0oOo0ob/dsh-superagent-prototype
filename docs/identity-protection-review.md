# Identity protection: host interface review

Status: implementation blocker for enforced owner-only policy, confirmed personality proposals and confidential shared memory. Identity version editing and preview can be delivered separately as a catalog; catalog publication must not be presented as protected runtime activation. This follows the approved messaging/identity plan, section 7: when public extensions cannot enforce the required protection, describe the host gap for review before modifying DSH.

## Current evidence

- `src/app/sessions.ts` selects `danger-full-access` in `ensure()`. Main has `bash`; Workers and their descendants have file and shell tools. Moving the SQLite database or role files outside a task directory does not restrict those tools.
- `src/app/http.ts` checks loopback Host/Origin and the literal `x-super-personal-agent-request: 1` header. The outer DSH transport adds its own admission/authentication; a read-only probe of this desktop profile was rejected with HTTP 403, `Browser access is disabled`. The plugin header alone is therefore not evidence of a live API bypass. The catalog has no payload-bound owner-confirmation record; review how to reuse the authenticated desktop path before activating protected changes.
- The available DSH `SandboxExecutionPolicy` contains a mode, workspace root and optional extra writable roots. `SandboxPolicyService.resolve()` accepts a per-call mode and Session override. File sandboxing confines writes; its documented reads remain unconfined. The mode alone does not provide an immutable plugin policy or an authenticated owner action.
- A workspace-write Session outside the state directory would close some direct write paths. It does not by itself establish who authorized a management mutation. Both the outer authenticated transport and plugin mutation authorization need to be considered; an admin-only TypeScript method name is not such a check.

The relevant host sources are `packages/sandbox/sandbox/src/index.ts`, `packages/sandbox/sandbox-policy/src/index.ts`, `packages/fs/fs-sandbox/README.md` and `packages/interaction/permission-presets/README.md` in the adjacent DeepSeek Harness checkout. This is source evidence; no write attack was performed against the live profile.

## Proposed host support

| Host capability | Required behavior | Plugin consumer |
| --- | --- | --- |
| Managed Session policy ceiling | Pin an owner-controlled ceiling that survives permission selection, one-call escalation, Session restoration and child creation. A denied ceiling cannot be widened by model input. | Main, IM, task Workers, subagents and background jobs use the same effective restrictions. |
| Protected host storage | File operations and OS-confined shell/process operations cannot mutate policy, identity versions or authority data. Confidential state also needs read isolation; symbolic links, broad workspace roots and extra writable roots cannot reopen it. | SQLite authority, drafts, published snapshots and private memory stay outside granted model roots. |
| Verified owner actions | Reuse the existing authenticated desktop transport where it provides the necessary authority. An owner action is issued and resolved by a trusted UI/identity path, bound to an exact payload hash and base versions, with expiration and single use. Model-origin loopback requests cannot manufacture the confirmation. | Publishing protected policy, accepting a personality proposal and granting private memory access check the recorded owner action. |
| Capability availability | Expose support and effective enforcement status through a documented service. Missing support fails before activating protected identities, rather than silently switching to a prompt-only policy. | The settings preview shows why activation is unavailable. |

The first implementation should protect writes and owner actions together. Confidential memory additionally requires the read-isolation acceptance cases. Existing context logging, task scheduling and publication queues can be reused; they do not require a separate Agent execution engine.

## Acceptance before runtime activation

1. A managed Agent cannot change the public policy through `write`, `edit`, a shell command, a child Agent, a background job, or a crafted local HTTP request.
2. A broader workspace, symlink, additional writable root, permission switch or escalation does not bypass protected paths.
3. A proposal confirmation authorizes only the reviewed diff and base versions. Replays, changed payloads, stale parents and model-generated confirmations fail without publishing.
4. A group Session cannot read private memory through either the memory service or raw filesystem/process access.
5. Restart restores the same ceiling and identity binding. Revocation is checked at the next operation, without changing an in-flight personality snapshot.

Until reviewed, changes remain inside the Personal Agent fork. No DSH host source, system permissions or live account access rules are modified. Stages that depend on an owner-only mutation or private-memory guarantee remain unactivated; the catalog UI states that boundary explicitly.
