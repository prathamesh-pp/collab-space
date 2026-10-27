# Collabry: 10-Minute Presentation Outline

## 0:00-0:45 | Problem and scope

Introduce the goal: a shared workspace with documents and role-aware access. Set expectations clearly: the persistent single-user TipTap JSON editor remains the active path. TipTap/Yjs/Hocuspocus client, ticket authentication, and persistence hooks are implemented, but a fail-closed readiness gate keeps collaboration disabled because Hocuspocus v3.1.1 detaches debounced store failures from its update callback. Database persistence and two-client behavior are unverified.

## 0:45-1:45 | Current project and stack

Show Next.js App Router, TypeScript, Tailwind, Prisma, PostgreSQL, Zod, bcrypt, and database-backed opaque sessions. TipTap is wired for persistent JSON document editing; the separate collaboration client/provider path is experimental, disabled by default, and its persistence behavior remains unverified.

## 1:45-3:00 | Data model

Walk through User, Session, Workspace, WorkspaceMember, Document, Comment, and CollaborationTicket. Point out the role enum and cascade relations. `DocumentVersion` and `Document.yState` are schema groundwork only; no version snapshots are available, and Yjs data is not active in the editor.

## 3:00-4:30 | Authentication and security

Show registration transaction: create user, workspace, owner membership, and starter document. Explain bcrypt password hashes with a 72-byte UTF-8 limit enforced at registration and login, random session tokens, SHA-256-only token storage, expiry, HttpOnly/SameSite cookie flags, generic login error, Zod input validation, and sanitized API failures.

## 4:30-6:00 | Authorization and API demo

Demonstrate workspace list/create and document list/create/read/rename/content-save endpoints. Explain membership checks, owner/editor-only document writes, revision conflicts, and `404` for nonmember document access. Show comments and the owner-only member role/removal controls, including last-owner protection.

## 6:00-7:00 | Tests and evidence

Show the isolated unit tests, typecheck, lint, and production build. These checks do not connect to PostgreSQL and do not prove database-backed behavior. Authenticated live save/reload and stale-write demonstrations require an explicitly configured database and must be run separately; no database integration suite is included.

## 7:00-8:15 | Gaps and risks

List the missing version snapshot/restore API, cursor presence, real two-browser/reconnect tests, rate limiting, and DB-backed automated tests. The access/history dialogs are implemented, but history is an explicit unavailable-state panel because version snapshots are not implemented. Do not claim tested realtime collaboration or durable Yjs saves.

## 8:15-9:15 | Next implementation milestones

1. Resolve Hocuspocus persistence-failure reporting without detached rejections; keep the operational gate closed until reviewed.
2. After explicit migration approval and verification, run database persistence, reconnect/restart, and two-client synchronization tests before considering activation.
3. Implement version snapshot/restore, cursor presence, rate limiting, and database-backed automated tests.

## 9:15-10:00 | Deployment and close

Explain Node 20.19+ recommendation, secret-managed `DATABASE_URL`, `npm run db:migrate:deploy`, HTTPS secure cookies, PostgreSQL backups, and the single-instance limitation. For a live demonstration, obtain approval to use a local PostgreSQL database, create an empty test database, copy `.env.example` to `.env` and configure its connection string, run `npm ci`, `npm run db:generate`, and `npm run db:migrate:deploy`, then start `npm run dev`. Register a test account, create a workspace and document, edit and wait for the saved status, refresh to verify persistence, then try comments, member lists, search, recent documents, access, and the history-unavailable dialog. A second test user and membership require a separately approved provisioning method because invites are not implemented. Reiterate that document bodies persist over HTTP but simultaneous editing is not available yet.
