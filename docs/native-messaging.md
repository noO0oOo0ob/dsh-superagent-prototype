# Native messaging implementation

The Personal Agent owns account onboarding, inbound commands, conversation context and durable rich delivery. No runtime dependency on the dsh-im plugin remains after cutover. Feishu/Lark ships first. Other channels are added through explicit capabilities.

## Decisions

- Direct messages use a stable Thread keyed by channel, account and conversation. Groups aggregate by channel, account and group; native topics and reply relations remain metadata. Workers belong to tasks, not chats.
- `/new` advances the current conversation context generation without removing its Thread history, deduplication ledger, Main history or background tasks. Group aggregation never grants every subscribed Worker ownership of every message.
- Results contain ordered typed blocks. Text (plain or Markdown), images and files are implemented; audio, video, links and semantic cards have versioned representations and explicit unsupported handling. No arbitrary provider payload or destination comes from the model.
- Worker report status and user publication are distinct. Selected files are required; text success with file failure is partial delivery. Main replies and automatic publication share immutable records.
- File registration snapshots bytes. Delivery persists each destination and part, including uncertain outcomes; retry never blindly replays successful parts.
- SQLite is authoritative; Obsidian is an independent readable export. Secrets remain in DSH credentials.

## Stages

1. [x] Pin and copy upstream Feishu/shared/UI source and focused tests.
2. [x] Rich publication protocol, binary artifacts and durable part receipts.
3. [x] Native Feishu account lifecycle, text intake and text/image/file delivery without dsh-im. Attachment intake is completed with conversation integration.
4. [x] Stable conversation Threads, commands and isolated context generations.
5. [x] QR/manual onboarding and account management UI.
6. [x] Feishu interaction parity, Main/Vault presentation and failure recovery UI.
7. [ ] Remove legacy runtime binding, clear the authorized existing account, build and regression checks.

Each stage is committed locally; no push. Live binding is left to the owner after completion. Tests must distinguish local mocked validation from actual platform delivery.

## Upstream

`vendor/dsh-im/UPSTREAM.json` pins v5.10.0 at c826bfa415d79669d8ebba206cf4a1eac554d8e2 and records SHA-256 for every copied file. The first import is mechanical. Subsequent local adaptations are tracked in Git and the manifest. Original plugin registration and independent Session execution are not activated. Retain the included LICENSE and THIRD_PARTY_NOTICES.md.

The Worker prompt/tool character budget is 44,000 (previously 42,000), accounting for the typed publication schema. Only implemented text/image/file blocks are exposed in the Worker tool; other types remain in the persisted protocol for future adapters.

Publication is mandatory on new Worker reports. Internal reports never select draft artifacts for external delivery. Each later publication has its own identity even while a human question remains pending. File snapshots become visible only after their bytes and metadata are durable.


Stable IM Threads use a new `im-conversation-v1` identity; existing message IDs and delivery receipts are unchanged. Historical message/topic Threads remain readable. Each conversation generation owns an isolated router Session. Main receives an audit notice; it does not execute the same incoming candidate a second time. Ordinary messages never broadcast to subscribed Workers; an application-verified reply correlation or an explicit route selects one task. Group task mutations require the original task owner.

Native slash commands are intercepted before model dispatch. `/new` and `/clear` increment the current conversation generation in the same transaction as the command receipt and reply; they cancel only its old router Session. `/tasks`, `/status`, `/stop`, `/steer`, `/retry`, `/result`, `/history` and `/help` use the same scoped command dispatcher. `/result` is an explicit resend under the command's own deduplication identity. Account/model/preset changes are made in the management UI and apply to new Sessions. Inbound attachments retain provider references; authorized tools validate the original message, download within the configured byte limit and snapshot bytes for later reads.


Account settings include QR/manual binding, reconnect/remove, permission repair, model/preset, workspace, context enhancement, access policy, group response policy, conversation directory and command menu. Conversation directory preparation runs only when a new dialogue generation is created. Changing the account workspace selects a new automatic-directory binding on the next generation; old directories and files remain intact. Native command menus list only supported Personal Agent commands; arbitrary Session binding/watch commands from the old bridge are intentionally excluded. Raw model-step streaming is not exposed: publication tools remain the sole authority for user-facing task output. Audio/video descriptors are reserved; speech settings are displayed as inactive until that adapter is implemented.


`/menu` publishes a host-generated card. Actions are bound to the originating bot, sender, chat, context generation and actual delivered provider message ID. Each action is consumed once and then dispatched as a logged command; the model cannot choose arbitrary recipients or provider payloads. Main result notices and the local result page retain artifact download links. Obsidian exports include immutable binary attachments beside Markdown; edited exports are preserved and reported rather than overwritten.
