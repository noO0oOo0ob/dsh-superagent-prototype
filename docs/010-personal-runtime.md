# Personal runtime

## Source context

Each Trigger has a stable application-owned context ID and trace ID. Sender-provided trace IDs remain in the Trigger's metadata and never grant authority. `context/<id>` exposes the original source, actor, threads, reply target and metadata; workers can read only contexts of triggers their ticket may read. Logged worker inputs and report relays carry context references.

SQLite retains context links for tickets, assignments, worker Sessions, reports and reply receipts. Follow-ups add references without replacing the origin. Report references are captured when the report is recorded; later inputs cannot alter them. Opening a phase-one database backfills context records and relations transactionally. Original Trigger metadata remains the single stored copy.

## Main Session and results

The runtime service is published in a separate Cordis child before startup waits for the Main Session. Its preset can therefore resolve the scoped subprocess provider during initialization; plugin activation still waits for Session readiness and reports startup failures.

Open the plugin's Main Session and chat normally. Startup initializes the local owner policy when absent, without replacing an existing policy or re-enabling a disabled source. The overview checks direct-request admission on enabled, installed sources, including IM account admission without a local sender list. Local user messages are retained as source requests without starting workers. The assistant uses `personal_agent_current_request` and `personal_agent_submit` when the user asks for background execution, naming an existing ticket for an explicit continuation. Plugin notices and IM-attributed RPC messages cannot impersonate local requests.

Reports produce immutable result snapshots and durable delivery effects. A full result notice appears in the Main Session without requiring the model to call a reply tool. The originating channel receives the selected publication content, with legacy channel limits still applying; local inbox receipts include the local result URL. The URL works only on the DSH Host and serves escaped text. Reports and results remain separate from delivery receipts: platform acceptance is not a read receipt. Transport failure does not rerun the task.

Addressed IM greetings, short questions and brainstorming use `personal_agent_route kind=respond`: Main sends the answer to the original message and settles the candidate without a ticket or worker. Main transcript text alone is not an IM reply. A direct IM candidate cannot be ignored merely because it needs no task; silent ignore requires the caller to identify an explicit human request for silence. Observed group chatter can still be ignored. The existing no-task decision retains an interaction marker so the model and timeline show a conversation reply rather than a silent ignore. Conversation replies use the durable outbox and checked account route; a repeated respond cannot send a second answer for a decided candidate.
