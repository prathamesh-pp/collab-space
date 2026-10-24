# Collab Space
Collab Space is an early-stage Next.js App Router project with account registration and login, opaque database-backed sessions, workspace management, and a persistent TipTap document editor. Rich-text content is saved as validated JSON with revision checks. TipTap/Yjs/Hocuspocus integration code is present, but collaboration is currently disabled in every environment pending safe persistence-failure reporting and integration tests.

## Status

Implemented in source:

- Registration creates a user, owner membership, starter workspace, and starter document in a database transaction.
- Login/logout use a 30-day `httpOnly`, `SameSite=Lax` cookie. Session tokens are random 256-bit values; only SHA-256 hashes are stored.
- Workspace listing/creation and document list/create/read/rename APIs require an authenticated user. Membership is checked for workspace/document reads and writes; nonmembers receive not-found responses.
- The dashboard restores sessions, lists workspaces, and links to individual document pages.
- The TipTap editor supports basic formatting and persists rich-text JSON through a bounded, validated endpoint. Content revisions reject stale writes; owner/editor roles can edit, while commenter/viewer roles are read-only.
- API JSON is validated with Zod. Unexpected errors handled by the shared wrapper return generic JSON responses.
- A PostgreSQL Prisma schema and additive migrations are included. `Document.yState` remains reserved for Yjs updates.
- Collaboration ticket issuance and Hocuspocus authentication logic are implemented, but the endpoint and server hooks are currently disabled by the fail-closed operational readiness gate.

Not implemented (do not treat as available):

- The TipTap editor/provider client and Hocuspocus Yjs persistence hooks are present, but the operational gate currently keeps collaboration disabled in every environment. Hocuspocus v3.1.1 detaches debounced store failures from the document-update callback, so a failed write cannot be reliably surfaced to the editor without a safe lifecycle integration. Provider synchronization is not a durability acknowledgement; database persistence and two-browser synchronization have not been integration-tested.
- Comments and owner-only workspace member role/removal controls are implemented. Version snapshots/history are not implemented; no version endpoints or restore UI are available.
- There are no workspace/document delete endpoints, email invitation flow, rate limiting, or automated database integration tests.

## Requirements

- Node.js 20.19+ recommended. This project was checked with Node 20.16.0; builds pass there, but an ESLint transitive package warns that it requires Node 20.19+.
- PostgreSQL 15+.
- npm 10+.

## Local Setup

1. Create a PostgreSQL database named `collab_space` using pgAdmin or your PostgreSQL administrator account.
2. Copy `.env.example` to `.env` and replace `YOUR_LOCAL_PASSWORD` with your local PostgreSQL password. Never commit `.env` or paste credentials into issue trackers.
3. Install dependencies, generate Prisma Client, and apply the checked-in migrations:

	```bash
	npm install
	npm run db:generate
	npx prisma migrate deploy
	```

4. Start the Next.js development server:

	```bash
	npm run dev
	```

5. Visit `http://localhost:3000` to sign in, manage workspaces, and open documents in the editor.

`npm run db:migrate` is a development convenience (`prisma migrate dev --name init`). Use `npx prisma migrate deploy` in deployment environments.

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string, e.g. `postgresql://postgres:<password>@localhost:5432/collab_space?schema=public`. Use a least-privilege application account outside local development. |
| `COLLABORATION_PORT` | For `dev:collab` | WebSocket server port (1-65535). |
| `COLLABORATION_ALLOWED_ORIGINS` | For `dev:collab` | Comma-separated exact browser origins; HTTPS in production, loopback HTTP for local development. Wildcards and paths are rejected. |
| `COLLABORATION_HOST` | No | Bind address for the separate WebSocket process; defaults to `127.0.0.1`. |
| `NEXT_PUBLIC_COLLABORATION_ENABLED` | No | Defaults to `false`. The editor, ticket API, JSON-write guard, and Hocuspocus server require exact `NODE_ENV=development` and this explicit flag, but an additional fail-closed readiness gate currently keeps collaboration disabled in every environment. |
| `NEXT_PUBLIC_COLLABORATION_URL` | When collaboration is enabled | Hocuspocus WebSocket URL. Use a local `ws://` address only for local development; the value is not a credential. |

`.env*` files are ignored by Git; `.env.example` is the only committed environment template. Use a secret manager in production. Require TLS for remote PostgreSQL and restrict network access to the application.

## Architecture

```mermaid
flowchart LR
  Browser[Browser or API client]
  Next[Next.js App Router\nAuth and JSON route handlers]
  Hocuspocus[Separate Hocuspocus WebSocket process\nTicket authentication only]
  Auth[Opaque session cookie\nSHA-256 token lookup]
  Policy[Session and membership checks]
  Prisma[Prisma Client]
  DB[(PostgreSQL)]
  Browser --> Next
  Browser --> Hocuspocus
  Hocuspocus -->|one-use ticket| Policy
  Next --> Auth
  Auth --> Policy
  Policy --> Prisma
  Prisma --> DB
```

The existing TipTap JSON autosave remains the active content path. Collaboration configuration accepts only exact `NODE_ENV=development` plus an explicit `"true"` opt-in, but the operational readiness gate currently disables the editor, ticket endpoint, JSON-write guard, and server hooks in all environments. This fail-closed state is required because Hocuspocus v3.1.1 does not await debounced persistence failures from its document-update callback; those failures cannot currently be presented as durable-save status. Migration application status is unknown and must be explicitly verified before any future activation. Two-browser and database integration tests are still required. The persistence design assumes one collaboration-server process per document; no Redis/shared-document coordination or active-socket revocation mechanism is configured.

Do not enable collaboration or remove the operational readiness gate until Hocuspocus persistence failures can be reliably observed without detached rejections, the required migration has been explicitly approved and confirmed applied, and database and two-client integration tests have passed. The configured flag alone does not activate collaboration. Do not expose tickets in URLs or logs.

## Authorization

Each protected route resolves the opaque cookie to a non-expired session, then verifies workspace membership. Workspace creation atomically inserts the owner membership and a starter document. Current write policy:

| Role | Read workspace documents | Create/rename/edit documents | Comment | Manage members |
| --- | --- | --- | --- | --- |
| Owner | Yes | Yes | Not implemented | Not implemented |
| Editor | Yes | Yes | Not implemented | Not implemented |
| Commenter | Yes | No | Not implemented | Not implemented |
| Viewer | Yes | No | Not implemented | Not implemented |

Comment/member permissions describe intended policy only; those APIs do not exist yet. Keep authorization server-side when implementing them.

## API

See [API documentation](docs/API.md) for endpoint payloads, responses, and limitations.

## Checks

Run the local gates:

```bash
npm run lint
npx tsc --noEmit
npm test
npx prisma validate
npm run build
npm audit --omit=dev
```

Previously verified in this workspace: TypeScript, ESLint, unit tests, and an authenticated browser smoke test for the existing JSON save/reload path. The migration's application status is not verified by the current collaboration-server foundation work. Database integration tests are not part of the automated suite.

## Deployment

- Deploy the Next.js application as a Node.js server; this is not a static export.
- Set `DATABASE_URL` in the hosting secret manager and run `npx prisma migrate deploy` before serving traffic.
- Run the Next.js application and Hocuspocus server as separate processes. Set `COLLABORATION_PORT` and an exact `COLLABORATION_ALLOWED_ORIGINS` allowlist; terminate TLS at a trusted reverse proxy for production WebSocket connections.
- Use HTTPS so production session cookies have the `Secure` flag. Use a least-privilege database account with TLS.
- Use Node.js 20.19+ or a current LTS to avoid the local Node 20.16 engine warning.
- Back up PostgreSQL and verify restore procedures. Expired-session and collaboration-ticket cleanup jobs are not implemented.
- Horizontal scaling and active-socket authorization revocation are not configured. Collaboration and its persistence hooks are currently fail-closed in every environment; do not deploy this as a production collaborative editor.

## Presentation

See the [10-minute presentation outline](docs/PRESENTATION.md).
This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
