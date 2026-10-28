# Collaboration service

Collabry uses the existing Next.js app for authentication and short-lived,
single-use collaboration tickets. The Hocuspocus WebSocket server is a separate
long-running Node.js process. Vercel's Next.js deployment does not start that
process, so collaboration needs an independently hosted Node service with
WebSocket support. The app and service must use the same PostgreSQL database.

## Environment variables

Configure the following values in each environment that runs collaboration:

| Variable | Next.js app | Hocuspocus service | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | Yes | PostgreSQL connection URL. The collaboration service reads and writes document Yjs state and validates tickets against the same database. Keep it server-only. |
| `DATABASE_URL_UNPOOLED` | Yes, if used by Prisma | Optional | Direct PostgreSQL URL used by Prisma tooling. It is not read directly by the collaboration server. |
| `NEXT_PUBLIC_COLLABORATION_ENABLED` | Yes | Yes | Set to `false` until the service is deployed and end-to-end verified. Set to `true` only to activate collaboration in a verified environment. This value is a feature switch, not a secret. |
| `NEXT_PUBLIC_COLLABORATION_URL` | Yes | No | Browser-reachable WebSocket URL for the deployed Hocuspocus service (`wss://...` in production, `ws://localhost:1234` locally). This is public configuration, not a credential. |
| `COLLABORATION_PORT` | No | Yes | Port on which the Hocuspocus service listens. |
| `COLLABORATION_HOST` | No | Yes | Bind address. Defaults to `127.0.0.1`; set to `0.0.0.0` only when the hosting platform requires it. |
| `COLLABORATION_ALLOWED_ORIGINS` | No | Yes | Comma-separated exact HTTPS origins of the Next.js app. Loopback HTTP origins are accepted for local development. Do not include paths or trailing slashes. |

Do not put database URLs, ticket values, or other credentials in any
`NEXT_PUBLIC_*` variable. The app and collaboration service need the same
database access because tickets are stored and consumed there and Yjs state is
stored on each `Document` row. No separate Hocuspocus provider or hosted
collaboration credential is assumed.

## Local verification

1. Configure `.env` with a local `DATABASE_URL`, a free `COLLABORATION_PORT`,
   `COLLABORATION_HOST=127.0.0.1`,
   `COLLABORATION_ALLOWED_ORIGINS=http://localhost:3000`,
   `NEXT_PUBLIC_COLLABORATION_URL=ws://localhost:1234`, and
   `NEXT_PUBLIC_COLLABORATION_ENABLED=false`.
2. Start the app with `npm run dev` and the service in a second terminal with
   `npm run dev:collab`.
3. For local end-to-end checks only, set the local feature flag to `true`,
   restart both processes, and sign in as two users with edit access to the
   same document. Confirm edits arrive in both windows, then disconnect/restart
   one client and confirm the document survives reconnection and a page reload.
4. Return the local flag to `false` when finished.

The collaboration process is runnable independently with `npm run
start:collab`. Deploy the app and this service separately, provide the values
above in each runtime as applicable, expose the configured WebSocket port over
TLS, and use the app's exact HTTPS origin in `COLLABORATION_ALLOWED_ORIGINS`.
Do not reuse a local WebSocket URL in production.

The current service persists each received Yjs update synchronously so database
write failures are not hidden behind a debounce timer. Measure database load
with realistic concurrent editing before increasing usage.

## Production activation checklist

Keep `NEXT_PUBLIC_COLLABORATION_ENABLED=false` in Vercel Production and on the
service until all of these checks pass in a production-like environment:

- Both services reach the same database and the existing migrations are
  applied.
- The browser can reach the WebSocket endpoint over `wss://`.
- Two authorized editors synchronize changes, and reconnect/refresh preserves
  content.
- Viewers, non-members, expired or reused tickets, and disallowed origins are
  rejected; writes remain restricted to owners and editors.
- Persistence failures are observable and clients can recover without losing
  the last persisted content.

After verification, set the public feature flag to `true` in both the Next.js
Production deployment and the collaboration service, set the exact service URL
in the Next.js Production environment, and redeploy/restart both services. This
repository change does not modify Vercel settings or deploy either service.
