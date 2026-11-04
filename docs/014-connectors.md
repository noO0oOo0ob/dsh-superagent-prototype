# Account-scoped IM Connectors

The Personal Agent owns Feishu/Lark credentials, QR/manual onboarding, platform connections, command handling and checked delivery. It uses pinned source modules from dsh-im 5.10.0; it neither loads that plugin nor forwards incoming messages to its Session bridge. Other channels require their own adapters.

## Account setup

Open Settings → Personal → Native messaging. Scan a Feishu/Lark QR code or enter the application's credentials manually. The account card supports reconnect, removal, permission/callback repair, alias, model/preset, working directory, context enhancement, access policy and group response settings. QR setup initializes an owner allowlist; manual binding follows the displayed account policy. Inspect that policy before enabling group use. Secrets are stored in DSH credentials under this plugin's own prefix, never in source metadata or the SQLite result records.

Native accounts automatically create Connector bindings. Existing enabled state and local restrictions survive reconnects. Incoming callbacks are acknowledged only after durable intake. Account changes invalidate obsolete callbacks and routes. Access policy runs before both normal messages and slash commands; group mention policy is separate from identity authorization. Account owners may administer their own bot.

## Threads, routing and commands

Each Connector registers Source `im-<connector-id>`. Message IDs include Connector ID, account fingerprint, conversation and native message ID. A private Thread is stable by channel, account fingerprint and conversation; a group Thread uses channel, account fingerprint and group. Native topic, root and reply IDs remain metadata. Workers belong to Tickets, not Threads.

Each conversation has a router Session and context generation. Ordinary messages go to that router without broadcasting to every subscribed Worker. A verified reply to a task message or an explicit routing decision can select one task. Shared group context does not authorize one member to stop or steer another member's task. A pending evaluation processes one incoming request at a time, so independent requests do not silently become a single task.

`/new` and `/clear` increment only the current conversation generation and cancel its old router turn. Thread history, Main history, deduplication receipts and background tasks remain. `/tasks`, `/status`, `/stop`, `/steer`, `/retry`, `/result`, `/history`, `/help` and `/menu` are intercepted before model dispatch. Task-changing commands require the original task owner. Model/preset/workspace commands describe current settings; changes occur in the UI and apply to new Sessions. A host-generated menu card accepts one action from its initiating sender and verifies the actual delivered card message ID.

Metadata includes stable context/trace references, account fingerprint, sender, conversation, message, native topic/reply IDs and timestamps. The configured scalar projection is recorded in each model-visible dialogue input. Display names do not grant permission. Inbound images and files retain provider resource keys; scoped tools verify the original message, apply the configured size limit and freeze downloaded bytes. The dialogue router cannot read arbitrary task directories.

Cross-conversation grants require exact source, conversation and verified account fingerprint on each side. Identity mappings do not replace grants. Revocation stops subsequent inputs and resource reads; it cannot remove content already logged or supplied to a model. Main receives audit and result notices without processing the same IM candidate again.

## Structured publication and delivery

A Worker registers selected files with `personal_agent_artifact` and calls `personal_agent_report` with mandatory `publication`: either `internal`, or `publish` with ordered text/image/file blocks. Internal summaries and draft files are not automatically sent. Workers select whether and what to publish; the Message Center resolves destinations from trusted source metadata. The versioned protocol also reserves audio/video/link/card blocks; only implemented capabilities appear in Worker tools. Speech transcription/synthesis and raw model-step streaming are not enabled.

File registration snapshots bytes rather than keeping a mutable path. The Message Center splits long text, uploads selected images/files and sends all parts in order. Text success does not hide attachment failure. Main result notices and local result pages include artifact download links; [Vault exports](011-vault.md) copy the same immutable attachment bytes.

Automatic publication and Main's reply tool share a result/destination receipt. Each part records state, upload key, provider message IDs and attempts. Retry skips successful parts and reuses uploaded resource keys. Timeout, process interruption or missing provider confirmation becomes `unknown`; it is never blindly resent. The Personal settings delivery list exposes partial/failed/unknown state and accepts an inspection note with explicit retry or confirmation. Confirmation means the operator inspected the platform; it does not fabricate a provider receipt.

Before every send, the adapter validates the captured Connector/account and asks Feishu for the original message to confirm sender, conversation and topic. Current group reply settings apply when opening a reply topic. No fallback changes an invalid destination into another chat. Historical whole-message receipts remain readable for pre-migration reconciliation; native deliveries use per-part receipts.

## Consumer mode handover

Two independent plugins must not own the same bot. Before rebinding an existing bot here, finish or stop its old accepted work, remove its old dsh-im connection and disable any legacy CLI watcher for that account. Use a newly bound bot for a clean acceptance test. Removing a connection does not delete task history.

Native account configuration and credentials are independent of old dsh-im storage. Historical Triggers and receipts remain; no credentials or execution history are copied silently. Old Connector bindings without a corresponding native account report unavailable and cannot receive or send. Reconnecting the same native account retains its Connector identity; deleting and recreating an account creates a new identity and is not a deduplication continuation. Old message/topic Threads remain readable while new intake uses stable conversation Threads.

There is no distributed exclusive lock shared with another installed plugin or another process. A message accepted by the old bridge and redelivered after migration can therefore require manual reconciliation. A timestamp alone is not proof that it was handled.

## Verification

Tests use fake DSH/platform services, temporary SQLite databases and temporary attachment directories. They cover QR/manual setup, cancellation, access policy, stable Threads, separate task routing, commands, directory preparation, source-scoped downloads, text/image/file delivery, partial failures, restart recovery and UI interactions. The pinned Feishu regression tests run separately with `pnpm test:feishu`. Live QR binding and an actual platform round trip require the owner's account and are not implied by these local tests.
