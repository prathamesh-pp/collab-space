# Collabry Demo Script

## Current safe demo boundary

No database connection, migration, or production/demo environment change was made during this handoff. The database-backed app has not been verified live. Demonstrate source and offline test evidence unless you have independently configured and verified a local database; do not claim PostgreSQL integration or deployment passed.

## Local app setup and demo

1. Follow the local PostgreSQL setup in the repository [README](../README.md#local-setup). The app requires `DATABASE_URL`; Prisma CLI also uses `DATABASE_URL_UNPOOLED`. Use a disposable local database, not production.
2. Run `npm ci`, `npm run db:generate`, and `npm run db:migrate:deploy` only after confirming the local target is correct; then run `npm run dev`.
3. Register a disposable account, create a workspace and document, edit title/body, and refresh to demonstrate persistence against that local database.
4. Add and resolve a comment; show the access panel and role explanations.
5. Version history requires the included migration on the database being used. It was not verified against PostgreSQL for this handoff; do not present it as live database evidence.

## Collaboration demo (only after integration verification)

1. A previous local Redis integration passed against loopback Memurai using in-memory persistence. It was not rerun for this handoff; state that it does not verify PostgreSQL persistence or a deployed service.
2. Deploy the Hocuspocus service separately with secure origins, TLS Redis, PostgreSQL persistence, ticket authentication, and revocation checks.
3. Keep the application feature flag off until the deployment is verified. Then, under an approved test configuration, open the same document in two independent browsers and demonstrate edits, cursors, names/colors, join/leave, reconnect, and revoked access.
4. Record the screen only after those browser steps work. Do not present local integration output as a deployed demo.

## Suggested narration

“This view is the workspace and document workflow. The API checks the caller's role server-side. The conventional editor uses validated JSON and revision conflicts. The repository also has an optional Yjs collaboration path; local WebSocket tests show same-server editing and presence, and a real Redis integration verifies two Hocuspocus instances synchronize. That Redis run used in-memory persistence; the deployed service and PostgreSQL persistence remain to be verified.”
