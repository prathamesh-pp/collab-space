# Collabry: first production deployment on Vercel + Neon

This project is a Next.js App Router application that uses Prisma ORM 6.12.0 and PostgreSQL. Deploy the Next.js app on Vercel's Node.js runtime. Do not use a static export or deploy `src/collaboration/server.ts`: that is a separate, long-running Hocuspocus WebSocket process, and real-time collaboration is fail-closed and must remain disabled.

## 1. Create the Neon database

1. In Neon, create a production project in a region close to the Vercel Function region. Use a new, empty production branch/database for this first schema deployment.
2. In the Neon connection dialog, copy both connection strings without placing them in source control:
   - **Pooled** (hostname contains `-pooler`) for Vercel's application runtime.
   - **Direct / unpooled** (hostname has no `-pooler`) for Prisma CLI schema operations.
3. Keep a separate Neon branch/database for Preview deployments. Do not point previews at production data.

The production migration below creates the tables from the checked-in migration history; it does not copy the existing local database records. If the Neon target is not empty or already contains application data, stop and review its migration history before applying anything.

## 2. Import the app into Vercel

1. In Vercel, create a project by importing `prathamesh-pp/collab-space` from GitHub.
2. Set the production branch to `master`, the root directory to the repository root, and the Framework Preset to **Next.js**. Keep Vercel's detected install/build/output settings; the repository `build` script generates Prisma Client before `next build`.
3. Select a supported Node.js LTS runtime (Node.js 22.x is a suitable project setting) and set the Function region close to the Neon project region.
4. In Project Settings → Environment Variables, add these names with the appropriate Neon values. Add them to Production and Preview separately, with Preview pointing at its own Neon branch:

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | Neon pooled connection string for the corresponding environment |
   | `NEXT_PUBLIC_COLLABORATION_ENABLED` | `false` |

   Keep the database value private. Do not add `NEXT_PUBLIC_` to it. Do not set `NEXT_PUBLIC_COLLABORATION_URL`; the collaboration server is not deployed. Vercel sets `NODE_ENV` for builds and runtime; do not override it.

`DATABASE_URL` is the pooled runtime URL used by the Prisma Client. `DATABASE_URL_UNPOOLED` is configured as Prisma 6's `directUrl`, so Prisma CLI schema commands use the direct endpoint. Store `DATABASE_URL_UNPOOLED` only in the protected terminal or CI environment used for schema operations; it is not needed by Vercel's build or runtime. This project uses Prisma's standard Node.js query engine; it does not need the newer Neon driver adapter. Neon connection strings require TLS; use the strings copied from Neon, which include its required connection options.

## 3. Apply the checked-in migrations as a controlled release step

Do not run migrations in the Vercel Build Command. Before sending production traffic, run the following from a trusted terminal or CI job checked out to the reviewed release commit, with both production Neon variables injected securely:

```sh
npm ci
npm run db:generate
npm run db:migrate:deploy
```

Prisma Migrate uses `DATABASE_URL_UNPOOLED` for the direct database connection. Confirm the command targets the intended Neon production project and branch before running it. `migrate deploy` applies only checked-in pending migrations; do not substitute `prisma migrate dev`, `prisma db push`, or a reset. For later releases, review and commit migrations first, run this same controlled step, then deploy the app. Do not automatically apply migrations from Preview builds.

The Vercel build can then run `npm run build`. Its Prisma generation step is safe at build time and does not apply schema changes.

## 4. Smoke-test the deployment

After Vercel deploys:

1. Open the Production URL over HTTPS and confirm the homepage loads.
2. Register a dedicated test account, sign out, then sign in again. Confirm the session survives a refresh and that the production session cookie is marked `Secure` and `HttpOnly`.
3. Create a workspace and document. Edit the title and body, wait for the title save and **All changes saved** status, refresh, and verify both remain.
4. Add and resolve a comment. Confirm workspace members can access only their documents; an unauthenticated request to `/api/auth/me` should return `401`.
5. Check Vercel Function logs for unexpected errors. Do not log database URLs, passwords, session tokens, or collaboration tickets.

The project does not include version history, invitations, email verification, password reset, rate limiting, or automated database integration tests. Recents are stored in browser `localStorage`. Do not present those missing capabilities as available. The successful local database check is not a substitute for this production smoke test.

## Environment variable names

- Required in Vercel for app runtime: `DATABASE_URL`
- Required in the protected Prisma CLI migration environment: `DATABASE_URL_UNPOOLED`
- Set explicitly to keep collaboration disabled: `NEXT_PUBLIC_COLLABORATION_ENABLED=false`
- Not required for this Vercel deployment: `COLLABORATION_PORT`, `COLLABORATION_HOST`, `COLLABORATION_ALLOWED_ORIGINS`, `NEXT_PUBLIC_COLLABORATION_URL`

The root `.gitignore` excludes `.env*` while allowing the placeholder-only `.env.example`; keep real connection strings in Vercel's encrypted environment-variable settings or a protected CI secret store.
