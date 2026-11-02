# Collabry - 10-minute presentation speaker notes

The deck contains 11 slides. Timings total 10 minutes. Notes distinguish source implementation from local evidence and unverified external behavior.

## Slide 1 - Collabry (0:00-0:30)

Introduce Collabry as a workspace and document editing application. Explain that the project combines an ordinary revision-checked editor with an optional real-time collaboration path. Set the boundary immediately: local verification is available, while production and PostgreSQL integration are not verified.

## Slide 2 - The problem (0:30-1:15)

Describe the product problem: teams need shared documents, discussion, and clear access roles. Explain the design goal of keeping the regular editing path understandable while building a separate path for concurrent edits. Do not claim adoption or user research that is not in the repository.

## Slide 3 - Product workflows (1:15-2:15)

Walk through registration, dashboard, workspaces, document editing, comments, member roles, and version history. Describe database-backed interactions as the implemented workflow, not as a live demo result unless a disposable local database has actually been prepared. Explain that invitations are absent.

## Slide 4 - Technology (2:15-3:00)

Name Next.js App Router, React, TypeScript, Prisma, PostgreSQL, TipTap/ProseMirror, Yjs, Hocuspocus, and Redis. Distinguish Redis coordination from document persistence. PostgreSQL is intended to hold application records and Yjs state, but live persistence is unverified.

## Slide 5 - System architecture (3:00-4:00)

Follow the diagram from the browser to Next.js APIs, session and membership checks, Prisma, and PostgreSQL. Then trace the optional collaboration branch through a short-lived ticket to Hocuspocus and Yjs. Mention Redis only on the multi-instance path.

## Slide 6 - Data model and APIs (4:00-5:00)

Describe User and Session, Workspace and WorkspaceMember, Document and Comment, DocumentVersion, and CollaborationTicket. Point out unique email, the unique workspace/user membership pair, document revisions, nullable JSON/Yjs state, and hashed one-use ticket values. Use the API matrix in the architecture document for route and authorization examples.

## Slide 7 - Yjs and concurrent editing (5:00-6:00)

Explain CRDT updates at a high level: independent changes can converge rather than one full document replacing another. TipTap binds to the Yjs document, while Hocuspocus moves updates over WebSockets. State plainly that a successful provider sync is not proof that data has been durably committed to PostgreSQL.

## Slide 8 - Presence and Redis (6:00-6:45)

Explain Awareness as ephemeral presence for names, cursor colors, and selections. The server replaces client identity with authenticated identity. Redis propagates updates and Awareness between instances; it is not a durable message queue. The previous two-instance run used in-memory persistence and is historical evidence only.

## Slide 9 - Security and roles (6:45-7:30)

Cover bcrypt password hashes, opaque session cookies with hash-only storage, server-side membership checks, and role boundaries. Collaboration tickets are short-lived and single-use, and active connections revalidate authorization. Do not imply a security audit or production penetration test took place.

## Slide 10 - Verification and challenges (7:30-8:45)

Report 125 offline tests passed after a machine-local Node 24 workaround. TypeScript, targeted ESLint, Prisma schema validation, production build, and git diff --check passed. PostgreSQL integration and migrations were not run; the earlier Redis integration used in-memory persistence; no performance or browser end-to-end measurements are available. A key engineering judgment is keeping unverified persistence separate from a green unit suite.

## Slide 11 - Limitations and next steps (8:45-10:00)

Summarize the implemented application and collaboration groundwork. Name the open items: verify PostgreSQL persistence, test two browsers, deploy the separate WebSocket service, measure performance, and complete a personal reflection with a genuine example. Close with the honest status: local checks passed; production behavior remains unverified.
