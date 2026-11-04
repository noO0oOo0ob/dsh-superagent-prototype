# Vendored messaging modules

`dsh-im/` contains the selected Feishu, shared messaging and client modules from dsh-im v5.10.0. See `dsh-im/UPSTREAM.json` for the exact commit and original file checksums, and `../docs/native-messaging.md` for integration decisions. This is source reuse, not a dependency on an installed dsh-im plugin.

To update, fetch an explicit upstream revision, copy the same module dependency closure, compare the recorded checksums, reapply or retire local changes, then run the focused upstream tests and Personal Agent integration tests. Never copy credentials, live state, node_modules or upstream bundled lib output.
