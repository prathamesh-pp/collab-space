# Collabry Test and Verification Report

## Current local results

| Check | Result | Scope and notes |
| --- | --- | --- |
| `npm.cmd test` | Passed, 125 tests, exit code 0 (2 November 2026) | An initial run hit Node 24's Windows `uv_os_get_passwd returned ENOMEM` startup error. The successful run used process-only `NODE_OPTIONS=--require=./.node-os-userinfo.cjs` with a machine-local helper. The helper is not included in the release and tests were not weakened. |
| PostgreSQL URL guard unit tests | Passed, 9 tests | Offline only; no database connection. Includes malformed and unsafe URLs, allowlist and TLS restrictions, and safe errors. |
| `npx.cmd tsc --noEmit` | Passed, exit code 0 | No TypeScript diagnostics. |
| `npx.cmd eslint src tests` | Passed, exit code 0 | Targeted app/test lint; does not include the existing root `.node-os-userinfo.cjs` finding. |
| Prisma schema validation | Passed | `npx.cmd prisma validate` validated the project schema with process-only local placeholder URLs; no database connection. |
| Prisma Client generation | Passed as part of build | `npm.cmd run build` generated Prisma Client 6.12.0; no migration or database connection. |
| `npm.cmd run build` | Passed, exit code 0 on sequential rerun | Next.js 16.4.3 production build completed with local placeholder database URLs and collaboration disabled. The first parallel gate attempt hit a transient Windows `EPERM` renaming Prisma's generated engine; a sequential rerun passed. |
| `git diff --check` | Passed | No whitespace errors; pre-existing line-ending warnings may appear on modified tracked files. |
| Local production-server smoke check | Homepage `200`; anonymous `/api/auth/me` `401` | Used local dummy database URLs and collaboration disabled. The anonymous route returned before database lookup. This checks the landing page and unauthenticated guard only; authenticated workflows were not exercised. |
| Architecture PDF | Generated, 5 pages | Generated from the Markdown source. PDF signature, page objects, and end marker were structurally checked; visual rendering was unavailable in the noninteractive environment. |
| PowerPoint | Generated, 11 slides and 11 notes pages | PPTX ZIP integrity, XML parsing, slide count, and notes coverage passed. PowerPoint desktop could not be opened through COM in this environment, so visual slide rendering was not checked. |
| Redis two-instance integration | Not run; loopback port 16379 had no listener | A previous recorded run passed 1/1 with two Hocuspocus instances and in-memory document persistence. That historical test is not evidence of PostgreSQL persistence or a deployed service. |
| PostgreSQL integration tests | Not run | No integration test or migration was run. |
| Browser recording, deployment, and performance checks | Not run | No browser executable/screen-capture tool, Vercel project access, or performance environment was available. No reliable latency or resource benchmark was collected. |

## Database integration boundary

No database was contacted during this handoff. The default `npm.cmd test` suite includes nine offline URL-validator tests; these validate strings only and do not establish database identity or connectivity. PostgreSQL integration and migrations were intentionally not run. A previous read-only check recorded a dedicated test target identity and empty schema, but that is not application integration evidence.

## Safe host workaround

The machine-local Node user-info preload was used only in the command process that needed it; it is not part of the project release. On this Windows host, the process-scoped command was:

```powershell
$oldNodeOptions = [Environment]::GetEnvironmentVariable('NODE_OPTIONS', 'Process')
try {
    $env:NODE_OPTIONS = '--require=./.node-os-userinfo.cjs'
    npm.cmd test
} finally {
    if ($null -eq $oldNodeOptions) {
        Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
    } else {
        $env:NODE_OPTIONS = $oldNodeOptions
    }
}
```

The local helper was not modified or included in the release. Prisma and Next.js reported that `.env` was loaded automatically by their tooling. Its contents were not inspected or printed. Process-level local placeholder URLs took precedence for validation/build commands; no database connection was made.

## Known limits

- PostgreSQL persistence and version-history integration are unverified; the version-history migration is unapplied.
- The Redis multi-instance result is historical and used in-memory persistence.
- Browser end-to-end behavior, deployed collaboration, production deployment, and performance were not verified.
- The personal reflection remains for the intern to complete from their own experience.
