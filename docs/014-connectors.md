# Account-scoped IM Connectors

Connectors adapt a verified messaging account into a normal Source. The current adapter consumes the same-Host `dshIm` v1 service, using the `exclusive-text-consumer`, `reply-text-checked`, and optional checked-history capabilities verified against the locally installed `@xmanrui/dsh-im` 5.10.0 source. The implemented incoming event format supports Feishu and Lark text messages. WeChat, email and other channels need their own verified intake and reply adapters; their appearance in dsh-im's UI does not imply that they implement this intake protocol.

## Explicit account setup

No account is enabled automatically. Install a compatible dsh-im provider in the same DSH Host and configure its account there; credentials stay with that provider. Use the Personal settings bot discovery action to obtain the exact bot ID and account fingerprint. Then add a Connector with a unique ID, the verified fingerprint, explicit conversation IDs and types, and an allowed-sender list. Enable it only after those fields are complete.

```json
{
  "connectors": [
    {
      "id": "personal-feishu",
      "enabled": false,
      "botId": "",
      "fingerprint": "",
      "conversations": [],
      "allowedSenders": []
    }
  ]
}
```

Each conversation has `id`, `kind` (`dm` or `group`), and `listen` (`mentions` by default, or `all`). Incoming messages retain account, conversation, sender, message, reply-root and thread identifiers. DM messages address the agent directly; group messages count as addressed when the provider marks an account mention. Other senders and conversations are acknowledged as ignored without creating task input. A callback is acknowledged as accepted only after the orchestrator has finished persisting it; a persistence failure is returned to the provider.

When provided by the source, sender names and conversation titles are retained with timestamps, native thread IDs and mentions. Logged model messages include only the scalar source fields `channel`, `botId`, `senderName`, `conversationTitle`, `conversationId`, `conversationType`, `threadId`, `messageId` and `sentAt`, alongside their stable context reference. Missing fields are omitted, never inferred from an account ID or display name. Fingerprints and arbitrary metadata are not inserted into every prompt; complete stored metadata remains available through the authorized `context/<id>` resource. Display fields do not grant routing or execution permission.

The provider grants an exclusive consumer per account. In the inspected dsh-im implementation, acquiring that consumer also persists `consumerMode: external-consumer`. Releasing the lease does not restore its prior ordinary Session mode. Use a dedicated bot when another workflow needs ordinary dsh-im chats, and explicitly restore the provider's account mode when returning ownership. Plugin ID isolation allows both agent plugins to load in one Host; it does not allow two consumers to own the same bot simultaneously.

## Identity and policy

Each Connector registers Source `im-<connector-id>`. Trigger IDs include Connector ID, account fingerprint, conversation ID and native message ID. Thread IDs include account fingerprint, conversation type, conversation ID and native thread or root ID. Reusing a Connector ID for another account cannot reuse the old account's thread identity.

Routing grant `from` and `to` objects contain `source`, `conversation` and optional `account`. For a Connector event, `account` must equal that event's verified account fingerprint on the corresponding side of the grant. A missing account is not a wildcard. Sources whose events have no fingerprint continue to use source/conversation matching. For example, a grant from `{ "source": "im-home", "conversation": "oc_home", "account": "<home account fingerprint>" }` to `{ "source": "im-work", "conversation": "oc_work", "account": "<work account fingerprint>" }` applies only to those two accounts. Identity bindings select a principal; they do not replace these account checks. Switching a Connector's account cannot continue an old account's task merely because the conversation ID is reused.

Personal settings own each Connector's enabled state and scope. The corresponding Source settings persist a complete versioned binding snapshot, and its policy records allowed senders while retaining other admission settings. The scope reader uses the supplied settings snapshot so the existing policy-change mechanism can compare previous and current authorization. Removing a Connector first disables its Source and notifies policy handling, then unregisters it; old task records remain available for inspection.

The runtime's `policyChanged(before, after)` callback must calculate policy effects using `sources.scope(input, version)` and apply them through the Engine in the same settings transaction. This revokes affected existing mandates as well as denying new messages. Source settings for these bindings are managed by Personal settings; edits to their generated binding fields are replaced during reconciliation.

Configuration changes abort obsolete account activations and active leases. Changes arriving during activation trigger another reconciliation pass. Stopping the plugin stops waiting for pending provider calls and releases any consumer that arrives later. Late messages and history results are rejected when the captured account binding no longer matches current settings.

Cross-conversation routing grants are checked for every new subscription input and worker resource read. Removing a grant stops automatic delivery from that conversation, even when a subscription already exists. Its trigger text, source metadata, input bodies and thread previews become unavailable through worker read tools; a transcript containing revoked source inputs also becomes unavailable through those tools. The task's original input batch and explicitly attached Main Session continuations remain readable. Worker access to one Main continuation does not authorize following unrelated Main requests. Content already supplied to a model or recorded in its Session cannot be removed retroactively, and existing reports or exported artifacts are not rewritten by grant removal.

## Replies and uncertain outcomes

Replies retain the original captured route; the adapter never falls back from a topic to its group mainline. Before sending it verifies Connector, bot, fingerprint, conversation type and ID, and allowed sender. Invalid route JSON is rejected without escaping the channel-authorization check. The provider additionally verifies the original remote message before replying. Its current text-reply limit is 4,000 characters; result summaries fit that limit while full results remain in Main Session and the local result view.

Before an external call, a durable delivery intent records message identity, immutable text and route hashes, account fingerprint and attempt number. A documented failure guaranteed to precede the send remains retryable. A stale route settles as `gone`. A timeout, cancellation, malformed response or otherwise unknown outcome remains `uncertain`; automatic effects do not repeat that external send. A process restart with a `sending` record follows the same reconciliation requirement.

Inspect the original remote conversation before resolving an uncertain delivery. The management API accepts `confirm_sent` or `retry` with a nonempty inspection note; the decision and timestamp remain in the receipt. `confirm_sent` allows the original Outbox effect to settle without sending again. `retry` authorizes another attempt with the original text and route. An in-flight call cannot be reconciled manually. Different content, route or account under the same delivery ID is rejected.

## History and verification

Checked history is optional. Reads require the original captured reply route, current account binding and active consumer. Returned pages are bounded and checked for account and conversation identity; thread reads also require the original native thread ID. Changed bindings, missing cursors and foreign messages cause a visible read failure. Historical text is context and does not create a new accepted instruction merely by being read.

The tests use a fake same-Host dsh-im service and temporary SQLite databases. They cover persistence-before-acknowledgement, account and thread separation, policy snapshot changes, concurrent configuration refresh, malformed routes, cancellation and late cleanup, checked history, immutable delivery identities, and manual reconciliation after restart. No real bot was enabled and no external IM message was sent during these checks. Formal setup still needs the chosen bot, verified fingerprint, conversation IDs and sender IDs, followed by a real account acceptance test.
