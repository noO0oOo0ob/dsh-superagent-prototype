# Group targeting upgrade

Group routing is now shared across accounts in the Personal Agent message center. Existing account-wide “respond to all group messages” switches no longer authorize unaddressed messages. Private conversations, historical tasks and delivery destinations are unchanged.

Open Message center → Channels and bots → a bot’s settings → Groups. After a group message supplies verified provider, channel and tenant scope, choose one default bot for that group. No default means no response to unaddressed chatter. Explicit mentions take priority, then verified replies to the receiving bot. Replies to another bot and unverifiable parent messages are not redirected. An unknown mention ID is not assumed to identify a person or another application.

Group-message permission may still be needed for the platform to deliver unaddressed messages; the existing permission repair flow remains. Permission alone does not select the default bot. Group names, matching text and timestamps never merge conversations. Old rejected events are not replayed after changing a default. Removing or rebinding the selected bot requires selecting a new default explicitly.

This migration preserves existing Connector, Thread, Trigger, Ticket, Session and delivery IDs. New targeting records have independent versioned keys. No accounts are removed or automatically enabled. Live two-bot platform verification is pending an owner-selected test group; offline tests do not claim that acceptance.
