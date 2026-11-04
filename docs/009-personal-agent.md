# 009 Personal Agent: phase one

This phase reuses the upstream Ticket, Assignment, evaluation, worker, recovery and reliable reply mechanisms. It removes mandatory GitHub startup and PR completion assumptions, adds a local inbox Source adapted from [JHOpenDev's fork](https://github.com/JHOpenDev/dsh-superagent-inbox), and separates all public plugin identifiers from the original. Install using [006 Deployment](006-deployment.md).

## First local task

In Sources, enable **Local inbox** with an absolute root such as `/home/me/personal-inbox`, agent name `agent`, and conversation `personal` with receive mode `mentions`. In Policy, allow sender `owner` for the inbox. Leave Execution's prepare command empty and processing unpaused. GitHub and Feishu can stay disabled.

Create `<root>/personal/in/` and place a JSON file there, preferably by writing a temporary file and renaming it to `.json`:

```json
{
  "id": "weekend-001",
  "from": "owner",
  "to": "agent",
  "text": "Plan a relaxed two-day trip; write the result as a Markdown document.",
  "metadata": {
    "traceId": "personal-weekend-001",
    "accountId": "local-owner"
  }
}
```

The Source records a Trigger, then moves the input into `in/done/`. The main Session evaluates/routes the authorized request and creates a worker Ticket. The worker receives a normal directory, writes its requested artifact and calls `personal_agent_report` with `state: ready`, a useful summary and artifact paths, omitting `pr_number`. A ticket without followed PRs completes on that report.

The existing report relay steers a `worker_report` into the main Session, carrying the Ticket, origin Trigger, summary and full-result read resource. The main Session uses `personal_agent_reply` to send the user-facing result. Reply JSON files appear in `<root>/personal/out/`, with `ticket_id`, `thread` and `reply_to`. This final wording is produced by the model; a persisted reply receipt handles transport retries after the model requests delivery. Completion is not equivalent to delivery: inspect both if a reply is missing.

## Thread and metadata semantics

A conversation plus message ID determines the stable Trigger ID. A follow-up names the original root in `thread` and its parent in `reply_to`, so it reaches the existing ticket instead of necessarily creating another:

```json
{
  "id": "weekend-002",
  "from": "owner",
  "to": "agent",
  "thread": "weekend-001",
  "reply_to": "weekend-001",
  "text": "Make the second day suitable for rain."
}
```

Source, actor, conversation, message and root references are persisted with the Trigger. Sender-supplied `metadata` is stored separately under `trigger.meta.external`; it cannot overwrite the adapter's routing fields or authorize work. `personal_agent_read` on `trigger/<id>` exposes the stored metadata to the main Session and authorized worker. Model-visible delivery and tool results use existing Session logging. Account linking, routing policy based on connector identity and hook-wide metadata propagation remain later work.

Repeating an inbound ID does not create another Ticket. Self-messages are archived without ingestion. Malformed files remain visible as unreadable inputs. Outbound files are published atomically and retries reuse the same delivery ID. The configured root and allowed conversation must still match a queued reply's destination; changing configuration does not redirect old replies to a different root.

## Coexistence and scope

| Surface | This fork |
| --- | --- |
| Display name | `super-personal-Agent` |
| Package and main bundle entry | `dsh-super-personal-agent` |
| Cordis service | `superPersonalAgent` |
| HTTP API | `/super-personal-agent/api/` |
| Worker and router presets | `dsh-super-personal-agent-worker`, `dsh-super-personal-agent-router` |
| Session IDs | `spa-main-…`, `spa-worker-…` |
| Model tools | `personal_agent_*` |
| Environment variables | `DSH_SUPER_PERSONAL_AGENT_*` |
| Panel and locale | `dsh-super-personal-agent`, `dshSuperPersonalAgent` |
| CSS and browser draft storage | Dedicated `spa-` and package-prefixed names |

Use a fresh state directory. No migration, import or deletion of original-plugin data occurs. The new icon identifies the personal assistant separately. The phase-one inbox is a filesystem adapter, not an Obsidian vault or an IM integration. SQLite remains the task/state store. Markdown artifacts can later be projected into Obsidian without changing the scheduler.

Source registration remains one instance per kind. GitHub remains one optional repository adapter. Multiple repository associations, IM Connectors, cross-platform identities and advanced source-aware worker routing are deferred. The main Session still serves as a managed routing/delivery Session, not yet a replacement for every ordinary DSH chat flow.

## Acceptance

Run `pnpm check`. The keyless tests cover account-free startup, ordinary task directories, metadata readback, completed reports without PRs, report relay into the main Session, idempotent inbox delivery, replay and persisted state, and isolated service/process namespaces. Account-backed behavior has regression coverage. A real model and installed DSH desktop run are separate acceptance steps: verify one local request, the resulting main Session notification and outbox result in the chosen profile before relying on unattended operation.
