# Collabry: 10-Minute Final Presentation

This talk track distinguishes repository implementation from verification. A prior real Redis integration passed locally using in-memory persistence, but it was not rerun for this handoff. No PostgreSQL integration, migration, browser end-to-end test, or deployment verification was performed. Do not present database-backed persistence or deployed collaboration as verified.

## 0:00–0:45 — Problem

Collabry organizes team workspaces, rich-text documents, discussion, and access roles. The project adds a path toward safe simultaneous editing while retaining a straightforward document workflow.

## 0:45–1:45 — Product demo

Show login, the dashboard, a workspace, the document editor, comments, access roles, and history. Explain that the editor saves validated TipTap JSON with revisions. Version history is in the repository but requires the migration on the demo database.

## 1:45–2:45 — Stack and architecture

Next.js and React power the app. Prisma maps PostgreSQL data. TipTap handles rich text; optional Yjs/Hocuspocus handles collaborative updates and awareness. Redis coordinates multiple Hocuspocus instances and does not replace PostgreSQL persistence.

## 2:45–4:00 — Identity and permissions

Explain password hashing, opaque sessions, one-time collaboration tickets, workspace membership, and role boundaries. Show that route handlers and collaboration authentication re-check permissions on the server.

## 4:00–5:00 — Editing and presence

Describe Yjs state, authenticated Awareness, cursor colors, collaborator avatars, online counts, and disconnect cleanup. Local Hocuspocus WebSocket tests cover same-server synchronization and presence. A previous two-instance Redis integration passed against loopback Memurai using in-memory document persistence; it was not rerun for this handoff.

## 5:00–6:00 — Comments and history

Demonstrate comment permissions and explicit labeled snapshots. Restoration preserves the current JSON as a `Before restore` snapshot, increments the revision, and rejects stale or mismatched restores.

## 6:00–7:00 — Test evidence

125 offline automated tests passed after applying the documented Windows/Node preload workaround to that process; 9 are URL-guard tests. TypeScript, targeted ESLint, Prisma schema validation, production build, and diff checks passed. A previous two-instance Redis run used in-memory persistence and was not repeated for this handoff. PostgreSQL integration has not run and no migration was applied.

## 7:00–8:15 — Honest gaps

The version migration is unapplied. Redis multi-instance synchronization has historical local test evidence only; that test used in-memory document persistence and simulated outage by disconnecting adapter sockets. App persistence, the deployed WebSocket endpoint, browser-based collaboration, and performance are not verified. Keep production collaboration disabled.

## 8:15–9:15 — Learning

Complete the individual reflection using your own experience: describe a concrete engineering decision, what testing taught you, a difficulty you handled, and what you would do next. Do not use generic or invented personal claims.

## 9:15–10:00 — Close

Recap the implemented app, authorization model, history flow, and collaboration foundation. Close by stating the verification boundary: local offline checks passed, while PostgreSQL integration, deployed collaboration, browser end-to-end testing, and performance remain unverified.
