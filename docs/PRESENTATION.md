# Collabry: 10-Minute Presentation

Use the accompanying submission notes as a factual guide. The real Redis integration passed locally against dedicated Memurai using in-memory persistence. Database, browser, and deployment gaps below should be stated plainly.

## 0:00–0:45 | Problem

Collabry gives teams a workspace for organizing rich-text documents, discussing changes, and controlling who can read, comment, or edit. The project goal is to make that document workflow safe and extensible toward real-time collaboration.

## 0:45–1:45 | Product walk-through

Show registration/login, the workspace dashboard, a document page, formatted editing, comments, access roles, and version history. The ordinary document page saves validated TipTap JSON through the Next.js API with revision checks. Version history is implemented but requires the checked-in migration on the demonstration database.

## 1:45–2:45 | Architecture

Walk through Next.js route handlers, Prisma, PostgreSQL, the separate Hocuspocus WebSocket process, Yjs, and the optional Redis coordination extension. Explain the two document paths: JSON autosave for normal editing and Yjs updates for the separately enabled collaborative path. Redis coordinates instances; PostgreSQL remains the persistence store.

## 2:45–4:00 | Authentication and authorization

Explain hashed opaque session tokens, bcrypt password hashes, one-time document-scoped collaboration tickets, server-side workspace membership checks, and the Owner/Editor/Commenter/Viewer policy. Active collaboration connections periodically revalidate authorization and close after revocation or role demotion.

## 4:00–5:15 | Presence and collaboration behavior

Describe authenticated Yjs awareness, deterministic collaborator colors and initials, cursor decorations, online collaborator indicators, document scoping, and disconnect cleanup. Local tests use real Hocuspocus WebSocket clients for same-server synchronization and presence. The two-instance Redis integration passed against isolated local Memurai; that run used in-memory persistence, and no WebSocket service is deployed.

## 5:15–6:15 | Version history and conflict handling

Show explicit labeled JSON snapshots and restore. Restoring checks document ownership, preserves current valid content as a `Before restore` snapshot, increments the content revision, and clears persisted Yjs state. Version creation and restore are paused while live collaboration is configured, preventing stale snapshots and active-document replacement until coordinated Yjs history is implemented.

## 6:15–7:15 | Evidence

Report the current repository checks: 125 automated tests passed, including 9 offline validator tests; TypeScript, targeted ESLint, Prisma schema validation, Prisma Client generation, production build, and `git diff --check` passed. The current Redis integration was not rerun because the local service had no listener; a previous two-instance run used in-memory persistence and does not establish PostgreSQL behavior. No PostgreSQL integration test or migration was run.

## 7:15–8:30 | Remaining verification

The version-history migration is unapplied. The dedicated Neon test branch/database and empty public schema are confirmed read-only, but PostgreSQL history persistence remains unverified. The hosted WebSocket service, two real browsers, and performance behavior also remain unverified. Keep production collaboration disabled until those checks pass.

## 8:30–9:30 | Engineering reflection

Use the individual reflection file to discuss your actual experience: which design trade-off was hardest, how authorization and revision checks shaped the implementation, what a test exposed, and what you would improve. Do not present invented personal experience.

## 9:30–10:00 | Close

Summarize the delivered application workflows, security model, collaboration groundwork, and exact next verification steps. Do not claim a deployed demo or completed production scaling until those external systems have been tested.
