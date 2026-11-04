# Personal setup and acceptance

The fork uses `dsh-super-personal-agent` package, plugin and storage identifiers, `superPersonalAgent` service, `spa-main-*` and `spa-worker-*` Sessions, and `/super-personal-agent` HTTP routes. It can coexist with the original plugin when each uses a different state directory. Do not point both at one database. No installed profile is changed by building this checkout.

## What works without accounts

Start with GitHub disabled and use the plugin's Main Session. Discussion remains inline. Explicit delegation records the original request, launches an isolated Worker, saves its result, and injects the result and local URL into Main without another model reply. Source contexts link original requests, task inputs, assignments, Sessions, reports, deliverables and deliveries. Trace IDs are references, never permission grants.

Personal settings are stored separately in the plugin SQLite database and edited in **Settings → Personal**. Every save uses a revision; a concurrent update returns HTTP 409 and requires reloading. Connectors, Vault and hooks start disabled. Repository resources start empty. Schedules exist only after explicit creation. The local management API requires its same-origin request header.

## Configuration to supply

| Feature | Required production values |
| --- | --- |
| dsh-im | Install a compatible dsh-im in the same DSH Host. For the verified Feishu/Lark adapter, opt the chosen bot into `external-consumer`, discover its bot ID and verified fingerprint, then configure a unique Connector ID, conversation IDs/kinds and allowed sender IDs. Existing chat routing must not also consume this bot. |
| Obsidian | An existing absolute Vault directory and an export subdirectory. No API token or Obsidian network server is needed. The optional application opens `obsidian://` links; Markdown remains usable without it. |
| Repository resources | Stable resource IDs and local Git paths, ordinary Git remote URLs or plain directory paths. Configure Git authentication in the execution environment; no credentials belong in the resource URL. Select zero or more IDs per new task. |
| Identity routing | Explicit source/actor identity pairs under one principal ID, plus directional grants whose `from` and `to` specify `source`, `conversation` and, for Connector events, `account` equal to the verified fingerprint. A missing account is not a wildcard. Equal display names or trace IDs never create an association. |
| Scheduled work | The original approving human request, exact timestamp with UTC offset, and optional interval. Current source authorization is checked again before each intake. |
| Hooks | An explicit absolute directory for JSON event files, selected event kinds and retry limits. Consumers can read those files using stable event IDs. |

The implementation was checked against local `@xmanrui/dsh-im` 5.10.0. Its verified exclusive inbound/reply protocol is Feishu/Lark only. WeChat, email and other transports can feed the generic local Inbox, but a native adapter must implement equivalent authenticated identity, deduplication, cancellation and checked reply semantics before it is advertised as supported. The legacy single-GitHub Issue/PR watcher remains optional; selecting multiple Git repositories does not enable Issue/PR polling on all of them.

## Results and storage

Workers can publish bounded UTF-8 text/Markdown files with `personal_agent_artifact`. The Host checks that the path remains within the task workspace, saves an immutable content snapshot and adds its link to the next report. Result pages display escaped content. Main receives full summaries and artifact links; IM text is capped to the provider limit and includes a stable task reference. Local result URLs are usable on the Host, not as public mobile web links.

SQLite is authoritative for tasks, metadata and delivery state. The Vault receives one-way Markdown exports with stable IDs and context references. Existing user-edited files are preserved, never replaced. Export failure leaves the task result intact and retries independently. The result page exposes the Obsidian URI once the export is available. An existing result can be exported explicitly after enabling the Vault. Editing an exported note does not create a new task; use Main or the generic Inbox for instructions.

Task, result and delivery facts are stored independently from optional hook delivery. Hook retries/replay never rerun a Worker. Uncertain external IM sends require inspecting the conversation and explicitly confirming delivery or requesting another attempt; an automatic timeout never triggers a blind duplicate send.

## Routing and execution

Each task has its own Worker Session; channels are not permanent shared Workers. Connector IDs and verified account fingerprints scope message and thread IDs. Same-conversation follow-ups can continue existing work. Cross-source or cross-conversation attachment requires explicit identity grants, except an authenticated local Main request explicitly continuing a task. Worker context subscriptions use the same isolation checks. Existing legacy GitHub/Feishu routing is retained for those legacy Sources.

Routing grants are rechecked for incoming subscribed messages and worker resource reads. Removing a grant stops further automatic fanout and access to that conversation through read tools; replacing an account fingerprint does not reuse its conversation permissions. The task's original request batch and its explicitly attached Main continuations remain readable. Content already delivered into a model Session and previously produced artifacts cannot be revoked retroactively.

Repository selection is snapshotted at acceptance. Git revisions are pinned at first preparation; resumed work keeps the same isolated worktree and its edits. Plain directories are copied into task-owned directories. Preparation failures are visible on the task and do not overwrite unrelated directories. This feature does not push branches or create PRs automatically.

Scheduled occurrences get independent execution records and Triggers. Duplicate intake after restart is idempotent. Missed interval slots coalesce rather than flooding the Worker queue. Pausing or stopping a schedule controls future intake; accepted tasks have separate stop controls. A schedule's `accepted` status means intake succeeded, not that its task finished.

## Verification boundary

Automated tests use temporary SQLite databases, temporary Vault/hook directories, isolated local Git repositories and fake DSH/dsh-im services. Test configuration is removed after each test; no real bot receives a message. Local inspection found no registered Obsidian Vault, so no production Vault was chosen. Real DSH installation/coexistence, a model-backed execution and an actual Feishu round trip still need acceptance with the production values above.

For live acceptance, first install the fork with a distinct state directory alongside the original plugin. Complete a Main-only task, then add a temporary Vault and verify a deliverable link. Add one test Feishu conversation, complete a task and verify the reply lands on its original message. Restart the Host and confirm completed work is not rerun. Finally add the intended repositories, schedule and routing grants individually.
