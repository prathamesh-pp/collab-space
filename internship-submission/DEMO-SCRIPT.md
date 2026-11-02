# Collabry Demo Walkthrough (6–8 minutes)

## Demo status and safe boundary

No screen recording or verified production URL is available. No browser executable or screen-capture tool was available in this environment. The local UI build succeeded, but database-backed flows were not run because no database connection or migration was made. Use this script only with a separately prepared disposable local database; otherwise show the landing page and describe database-dependent features from source and test evidence without implying they ran live.

Do not enable collaboration against production or present local unit tests as deployed collaboration. The prior two-instance Redis result used in-memory persistence and was not rerun for this submission.

## Preparation

If performing the live local app demo, follow [README local setup](../README.md#run-locally) with a disposable PostgreSQL database and use the ordinary HTTP editor path. For collaboration, follow the separate service guide and use an isolated local Redis instance. Do not use production data. Create two disposable accounts only if a second role is required; the app has no invitation flow.

## Timed walkthrough

### 0:00–0:40 — Landing page and purpose

**Show:** `/` and the Collabry wordmark.

**Say:** “Collabry brings workspace organization, rich-text documents, comments, and role-aware access into one application. The conventional editor saves validated document JSON with revision checks. There is also an optional Yjs/Hocuspocus path for live editing.”

**Expected result:** Landing page loads and describes the product. If only static/local build verification is available, say the application landing page was build-checked, not production-deployed.

### 0:40–1:30 — Registration, login, and dashboard

**Show:** Registration and login UI, then the dashboard after authentication, if a local test database is configured.

**Say:** “Passwords are bcrypt-hashed. The browser gets an opaque HTTP-only session cookie; the database stores only its hash. Creating an account also creates a personal workspace, owner membership, and starter document.”

**Expected result:** A disposable local account reaches its dashboard and remains signed in after a refresh. These database-backed steps were not verified during this submission; do not claim they were.

### 1:30–2:20 — Workspace and document access

**Show:** Workspace list, create workspace, document list, and Access panel, if a local database is configured.

**Say:** “Every protected read and write checks workspace membership on the server. Owners and Editors can edit, Commenters can discuss, and Viewers are read-only. Owners manage roles and the last owner cannot be removed.”

**Expected result:** The UI shows current membership and roles. Invitations are not implemented, so any second account must be provisioned separately for a role demonstration.

### 2:20–3:15 — Rich-text editing and stale-write protection

**Show:** A document, formatting controls, edit state, and saved indicator; refresh to demonstrate saved content only if using a prepared local database.

**Say:** “TipTap stores a bounded, validated JSON document. Each save includes the revision the editor read. If the document has changed since then, the API returns a conflict instead of silently overwriting newer work.”

**Expected result:** With local PostgreSQL prepared, edits save and survive refresh. Otherwise show the unit test and source flow, and state that live persistence was not verified.

### 3:15–4:00 — Comments and history

**Show:** Add/resolve a comment and open History. Demonstrate version create/restore only on a local database with the version migration applied.

**Say:** “Comment permissions follow workspace roles, and authors can delete their own comments. Version history stores explicit labeled JSON snapshots. Restore keeps the current version as a ‘Before restore’ snapshot and rejects concurrent changes.”

**Expected result:** Version routes require the included migration. The migration is unapplied on the previously checked test database, and PostgreSQL version history was not integration-tested for this handoff.

### 4:00–5:10 — Collaboration architecture and presence

**Show:** Architecture slide or source diagram. If a verified local two-client environment is unavailable, do not claim a live multi-browser demo.

**Say:** “Yjs represents concurrent edits as CRDT updates. Hocuspocus carries those updates over WebSockets. Presence uses Awareness, with identity derived from the authenticated server connection. Redis propagates updates and awareness between Hocuspocus instances; it is not the durable document store.”

**Expected result:** The code and offline same-server tests cover collaboration hooks and presence. A previous Redis integration passed with in-memory persistence only. No WebSocket service or PostgreSQL-backed collaboration was verified or deployed.

### 5:10–6:00 — Security and verification summary

**Show:** Test report and implementation boundaries.

**Say:** “The offline suite passed 125 tests. TypeScript, targeted lint, Prisma schema validation, production build, and diff checks passed. PostgreSQL integration, browser end-to-end behavior, production deployment, and performance are not verified. The collaboration feature flag should remain off in production.”

**Expected result:** Report the actual test table. Do not describe unit tests as database or end-to-end evidence.

## Suggested screenshots for a future submission

No screenshots are included because no browser capture was available. Useful genuine screenshots would be:

1. Landing page with the Collabry brand and product description.
2. Authenticated dashboard with workspaces and recent documents (using disposable demo data).
3. Document editor showing formatted text and the save state.
4. Comments panel and workspace Access roles.
5. Version History dialog after the migration is applied to an approved local demo database.
6. Two independent browser clients showing live cursors and presence, only after that flow is actually verified.

Capture real application screens only. Remove personal data and never include credentials, tokens, or database settings.
