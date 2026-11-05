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

## Interface review recommendation

This review uses adjacent DSH source revision `ce7073d512` and the fork at `d4fcc67`. The fork resolves DSH dependency version `0.2.1-alpha.2`; source-interface conclusions are not a claim that an installed DSH NEXT release already provides the proposed additions. Real DSH NEXT validation loaded the catalog, preview and group-settings page after a Host restart; no policy-bypass write or real IM test send was performed.

Extend existing services before adding a separate permission framework:

| Existing surface | Reuse | Missing obligation |
| --- | --- | --- |
| `SandboxPolicyService.resolve(request)` | One resolution path for Session mode, workspace and extra writable roots | A managed execution ceiling must still apply after a requested escalation or preset change. Protected-path denies must win over broad workspace or extra-root grants. |
| `SandboxExecutionPolicy` and confinement providers | Explicit resolved policy and `full`/`partial` enforcement reporting | The current vocabulary expressly excludes network and process visibility and does not describe read-denied paths. Report each required protection separately; do not infer private-data isolation from file-write enforcement. |
| Filesystem, bash, terminal and child execution providers | Existing operation ownership, denial errors and cancellation | Every managed execution route must enforce the same ceiling or reject the execution before it starts. External providers without enforcement evidence cannot inherit an unverified guarantee. |
| Approval service and desktop authentication | Durable asked/decided events, cancellation, authenticated UI transport | `ApprovalService.request()` requires an open model turn and returns an outcome from composed answerers. It does not identify a human owner or bind an exact persistent configuration diff. Reuse the UI transport, but add payload-bound owner decisions independent of model-turn approval. |
| Session events/projections | Durable reconstruction and model-visible context logs | Persist a managed policy reference and effective revision through restore, fork, spawn and background execution. Missing policy authority must stop protected activation rather than use deployment defaults. |

The proposed operations below are review targets, not APIs that exist today:

- `managedPolicy.bind(session, policyRef)` is available only to the trusted owner/plugin composition. It records an immutable policy reference before the first operation and returns explicit enforcement status. A child receives the parent's ceiling intersected with its own constraints. Unbind, expansion and replacement require the owner path; a model field cannot supply the authority.
- The existing `sandboxPolicy.resolve()` produces the ordinary requested mode plus the enforced managed constraints. Every executor checks support before executing. A provider that bypasses confinement for `danger-full-access` must still reject a managed request that requires confinement. Tool-name filtering remains useful but cannot replace this check.
- `ownerActions.request()` accepts the operation, exact payload digest, base revisions and expiry; the trusted desktop UI shows that exact payload. `ownerActions.consume()` atomically consumes one approval with the mutation. A changed payload, replay, stale base, model-origin decision or unavailable trusted answerer fails without changing the catalog. Idle settings edits must work without inventing a model turn.
- `managedPolicy.inspect(session)` exposes requested permissions, effective restrictions, enforcement support and an actionable unavailable reason. Do not return a single “safe” boolean that merges write confinement, read isolation and confirmed owner authority.

Protected control state includes the authority database, policy references, published versions and confirmation state. Direct shell/filesystem access, child providers, credential access and model-controlled desktop/API paths must be considered together. If the current OS provider cannot protect the required control resources, the managed execution must use a restricted provider or stay unavailable; private-memory confidentiality needs a separate read/process-isolation acceptance gate. A plugin-specific HTTP nonce without protecting its authority and credentials is insufficient.

## Proposed implementation order after review

1. Add the managed-ceiling fields and explicit provider support reporting to DSH; update filesystem, shell, terminal and child consumers together. Test persistence and rejected escalation before activating them in the Personal Agent fork.
2. Reuse authenticated desktop transport for owner decisions, bind exact payloads/base revisions, and verify that model-accessible paths cannot forge or directly mutate those decisions. Public-policy writes and catalog activation remain unavailable until both steps pass.
3. Replace the fork's unconditional full-access selection only for explicitly migrated managed Sessions. Existing Sessions are marked as requiring migration, never silently advertised as protected. Stop or drain old shell jobs before switching enforcement; new checks cannot retroactively constrain an already running process.
4. Enable stage 5 identity bindings and stage 6 proposals against that support. Gate stage 7 private memory on read/process isolation; retain the existing result-export behavior independently. Stage 8 follows its own scheduling and permission checks.

No host implementation is authorized by this document. The review decision is whether to adopt these guarantees and the minimal host extension points before implementation; it is not a request to weaken existing DSH authentication or to treat a role prompt as enforcement.
