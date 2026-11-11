# Main routing upgrade

The plugin no longer starts independent IM Dialogue Agents. Main is the only semantic router; Conversation, Ticket, Assignment and delivery records coordinate Main and task Workers. An authorized unique binding can bypass Main. Native IM ordinary messages and ambiguous legacy task/PR subscriptions require Main routing. Direct delivery does not enlarge a task's mandate.

Stop the old plugin before starting this build against the same state directory. Startup cancels loaded legacy Dialogue Agents and atomically requeues outstanding IM evaluations with their existing IDs. The migration marker and queued effects commit together. Candidate delivery uses a Main-specific identity distinct from old audit notices; retries use that same identity. Accepted tasks, replies, uncertain deliveries and historical logs are not replayed or deleted. Old Dialogue Sessions are history-only and their tools are blocked when opened.

Main keeps its own model, preset and workspace. Per-account router model settings and automatic dialogue-directory preparation no longer control routing. Per-source expert allowlists/defaults/fixed mode still apply. Account persona guidance is captured by context generation and logged in each source's Main candidate; it is not a global persona replacement. Legacy context identifier fields remain readable and do not imply an active Agent.

`/new` and `/clear` increment the source conversation generation. They invalidate old pending decisions, retain Main history and Workers, and do not force the next message to create a Ticket. A shared Main history is not strict model-level isolation between unrelated users; use this installation only within its intended trust scope.

Do not downgrade a live database after new routing decisions or external sends. Preserve the state directory and receipts, stop intake before a rollback, and reconcile outstanding effects against actual external delivery. Restoring an old database cannot undo sent messages or Worker side effects.
