// `run-promote.js` runs first (imports evaluate in source order), swapping in
// any staged database before the server module below opens its connection.
// `run-cloud-boot.js` follows: disaster recovery from the backup bucket (only
// on an empty volume) and the litestream replication sidecar — no-op unless
// BUCKET_NAME is set. The server shuts down gracefully on SIGINT and SIGTERM.
import './run-promote.js';
import './run-cloud-boot.js';
import '/app/build/index.js';
