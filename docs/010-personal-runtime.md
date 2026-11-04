# Personal runtime

## Source context

Each Trigger has a stable application-owned context ID and trace ID. Sender-provided trace IDs remain in the Trigger's metadata and never grant authority. `context/<id>` exposes the original source, actor, threads, reply target and metadata; workers can read only contexts of triggers their ticket may read. Logged worker inputs and report relays carry context references.

SQLite retains context links for tickets, assignments, worker Sessions, reports and reply receipts. Follow-ups add references without replacing the origin. Report references are captured when the report is recorded; later inputs cannot alter them. Opening a phase-one database backfills context records and relations transactionally. Original Trigger metadata remains the single stored copy.
