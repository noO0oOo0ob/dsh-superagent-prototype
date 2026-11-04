# 013 Schedules and hooks

Schedules turn explicitly approved instructions into distinct task inputs. Hooks publish immutable task facts. Both use the plugin's SQLite database and existing Host pass loop; neither starts another application, model or polling timer. See [010 Personal runtime](010-personal-runtime.md) for source context and result delivery.

## Schedules

Create a schedule from an existing authorized human Trigger. A definition has an immutable ID, a title, the instruction text, the approving Trigger ID and either an ISO timestamp (`once`) or a first timestamp plus `everyMs` (`interval`). Main Session tools only use the latest original local human request; they cannot substitute an IM message or plugin notice as local approval. The model must have an explicit request for scheduled execution, and must clarify ambiguous times or timezones. All accepted timestamps are normalized to UTC.

Each due occurrence has its own persisted execution ID, Trigger ID and Thread. It retains the original source, actor and context reference, and may reply only through the approving message's captured reply target. The `schedule` Source must validate the exact persisted Trigger through `authorizedTrigger`; arbitrary metadata naming a schedule or execution never grants authority. Authorization is rechecked at creation, resume and every intake attempt.

After verifying a scheduled Trigger, intake records its approving Trigger in an immutable parent-context ledger in the same database transaction. Workers may retrieve that original context and its metadata; unrelated context references remain inaccessible. Task, attempt, report, result and delivery records retain both the scheduled event and its verified parent references. A metadata field alone cannot establish this relationship.

The schedule and each execution are separate records. Execution `accepted` means the Engine accepted its input; the linked task may still be queued, running or blocked. Pausing holds future occurrences and retries. Resuming an overdue interval produces one occurrence and advances to the next future slot, without replaying every missed interval. Stopping cancels unaccepted occurrences and queued retries; already accepted tasks retain their own stop controls. Stopped and completed schedules require a new ID to start again.

Each bounded pass processes at most `scheduler.maxDuePerPass` occurrences. Intake failures retry after `scheduler.retryDelayMs`, up to `scheduler.maxAttempts`; a failed or blocked intake can then be retried explicitly. The same execution and message IDs survive retry and restart. A confirmed source-filtered intake needs an explicit retry with a new message ID because the Engine retains filtered Triggers; its logical execution ID remains unchanged. Retrying an accepted task through the schedule API is refused.

Updating an active or paused schedule requires its current revision and a newly approved instruction. It cancels unaccepted occurrences from the old revision while preserving accepted tasks and historical execution records. Intake and its accepted marker commit in one database transaction, so a crash cannot leave an admitted task without its matching execution record.

## Hook facts and local output

The supported events are `task.state`, `result.saved` and `delivery.status`. Each version-1 event contains a stable event ID, timestamp, task ID and context references, plus the corresponding state, result ID or delivery ID. Events contain facts, not executable scripts or invented model metadata. Reusing an event ID with different facts is rejected.

Hook events are retained even when output is disabled. Enable `hooks.enabled`, set an absolute `hooks.directory`, and select `hooks.kinds` to queue new events. Enabling output does not export historical events automatically; replay a chosen event explicitly. `hooks.maxPerPass` bounds each pass and `hooks.retryDelayMs` controls retry timing. These settings require no external account or credentials.

Each event is written to one stable `.json` filename through an exclusive temporary-file publication. Retrying after a crash between file publication and SQLite acknowledgement recognizes the existing identical file. A conflicting file or symlink is never overwritten. Failed deliveries remain visible and retry independently of the Worker; a retry never restarts task execution.

A queued delivery captures its destination directory. Changing the configuration does not redirect old deliveries; restore the original directory to retry them, or explicitly replay an event to the new directory. Once a directory has been resolved during an attempt, changing its symlink target is rejected. Host shutdown stops new publications; a filesystem operation already started may finish, and an identical-file retry safely resolves its outcome.

## Integration and acceptance

`Schedules` needs the Store, synchronous Engine intake, current authorization, a clock and scheduler options. Register the `schedule` Source, adapt its admission through the verified original Trigger, and call `pass()` from the existing processing loop only while processing is enabled. Register `personalTools` on Main Session with `currentRequest()` and `requestPass()`; worker Sessions must not receive schedule management tools.

`Hooks` needs the Store, current hook configuration, clock and Host lifetime signal. Record events inside the same transaction that saves the corresponding task fact, then call `pass()` from the Host loop. Result publication and delivery status changes must use stable fact IDs. `record`, `replay`, `retry`, `list` and `deliveries` are separate from Worker execution.

Focused tests cover real SQLite reopen, intake rollback, interval coalescing, bounded processing, authorization revocation, pause/stop/retry, mutation tool restrictions, immutable facts, temporary directories, output conflicts, symlink changes and file-publication acknowledgement recovery. The tests use generated temporary directories that are removed afterward. Production hooks require an operator-selected output directory; schedules require the actual requested times and authorized instructions.
