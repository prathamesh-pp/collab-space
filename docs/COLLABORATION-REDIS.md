# Multi-instance Hocuspocus and Redis

Collabry pins `@hocuspocus/server`, `@hocuspocus/provider`, and the official `@hocuspocus/extension-redis` to 3.4.4. The Redis extension publishes Yjs document updates and awareness, requests current state when another instance already has a document open, and serializes its document-store hook with Redis locks. It does not store document data. Collabry's existing PostgreSQL Yjs persistence remains in place.

## Service setup

1. Provision a private Redis service that supports Redis Pub/Sub and the locking commands used by the Hocuspocus Redis extension. Keep it reachable only from the collaboration server network. Use a TLS endpoint for any non-loopback host.
2. Configure these server-side variables in the secret manager for every Hocuspocus instance:
   - `COLLABORATION_REDIS_URL`: the same `rediss://` endpoint and credentials on every instance. For local development, `redis://localhost:6379` is accepted.
   - `COLLABORATION_REDIS_REQUIRED=true`: makes configuration fail if the endpoint is omitted. Keep this true on all instances behind the same load balancer.
   - Existing `COLLABORATION_PORT`, `COLLABORATION_HOST`, `COLLABORATION_ALLOWED_ORIGINS`, database connection, and collaboration feature flag settings.
3. Start the collaboration server process on each instance with `npm run start:collab`. The server waits up to 10 seconds for both Redis connections to become ready before listening. Configure the load balancer to forward WebSocket upgrades to these processes and point `NEXT_PUBLIC_COLLABORATION_URL` at that WebSocket load balancer.
4. Keep the browser-facing collaboration flag disabled until the WebSocket service, database persistence, authorization, and two-instance behavior have passed the verification below. No production deployment or environment changes are performed by this repository change.

The Redis key prefix is `collabry`; document channels are keyed by the globally unique document ID. Authentication and role checks remain in the Hocuspocus connection hooks and run on every instance. Do not share Redis with unrelated Hocuspocus applications unless they use a distinct key prefix.

## Failure behavior

When either Redis connection leaves the ready state, active WebSocket connections are terminated and new ticket consumption and collaboration messages fail closed. Redis client reconnects automatically; clients reconnect after both connections return to ready and obtain fresh, single-use tickets. A failed update or awareness publish also closes current connections. Redis Pub/Sub is not a durable message queue: a service outage can interrupt in-flight changes, so clients must not treat provider sync as a PostgreSQL durability acknowledgement.

## Automated integration test

The integration test creates two independent Hocuspocus `Server` instances in one Node test process, each with its own real Redis extension and real WebSocket provider clients. It connects directly to each instance's ephemeral localhost port, so no load balancer or browser is required. The Redis endpoint must be loopback-only; the test rejects non-loopback endpoints to prevent accidentally using a production Redis service.

Prerequisites:

1. Start a dedicated local Redis service that supports Pub/Sub and the locking operations used by Hocuspocus. The test neither flushes Redis nor shuts down the Redis service. Use a dedicated instance/database because the extension uses the `collabry` prefix.
2. If `redis-server` is installed locally and port `16379` is free, start an isolated, non-persistent Redis process in its own terminal:

   ```powershell
   redis-server --bind 127.0.0.1 --port 16379 --save "" --appendonly no
   ```

   Leave that terminal running. This command binds only to loopback and disables disk persistence. If you use another already isolated local Redis service, use its loopback URL and do not stop it as part of test cleanup.
3. In a second PowerShell terminal, set the test-only endpoint for the current shell and invoke the dedicated test command:

   ```powershell
   $env:COLLABORATION_TEST_REDIS_URL = 'redis://127.0.0.1:16379'
   npm run test:collaboration:redis
   ```

   The URL is never printed by the test. TLS URLs using `rediss://` are also accepted when their hostname is loopback.
4. PostgreSQL is optional for Redis/pubsub verification. Without `COLLABORATION_TEST_DATABASE_URL`, the test uses a shared in-memory persistence repository and reports that mode in the test title. To verify real PostgreSQL persistence, use only the dedicated Neon project `collabry-production`, branch `collabry-test` (`br-steep-leaf-b4p3hqt3`), database `collabry_test`, and direct hostname `ep-muddy-thunder-b4hdbzfm.c-6.us-east-2.aws.neon.tech` with exactly `sslmode=require`, `sslaccept=strict`, and `channel_binding=require`. A shared validator rejects production/unknown hosts, localhost, pooled endpoints, other database names, and absent or weaker TLS settings. The test creates uniquely identified fixtures and removes only its own workspace and user. It does not migrate or reset the database. The dedicated target was verified read-only; migrations remain unapplied pending separate review and explicit approval.

The test checks bidirectional Yjs edits, authenticated awareness across instances, disconnect cleanup, persistence and document reload on both instances, role demotion and session revocation on both connections, closed sockets and denied authentication during Redis client disconnection, and fresh-ticket reconnection plus edits after both adapters reconnect. The outage case disconnects only the test adapters' Redis sockets and reconnects them; it does not stop or pause the Redis service.

## Latest local result

The real two-instance test passed against dedicated Memurai at loopback port 16379 with in-memory document persistence. Its two `[onAuthenticate] Collaboration coordination is unavailable.` warnings are expected: the test intentionally disconnects both adapters, then verifies that each instance rejects a new connection until Redis is restored. This does not verify PostgreSQL persistence, a complete Redis service outage, browser behavior, or a deployed WebSocket service.

For PostgreSQL-backed version-history verification, set `COLLABORATION_TEST_DATABASE_URL` to the allowlisted direct endpoint and run `npm run test:database:versions`. If the database schema is not provisioned, apply the checked-in migrations to `collabry_test` only after a separate review and explicit approval. Neither integration test applies migrations.

The test uses `node:test` teardown to close every client and server and dispose of the optional Prisma client/fixture even on assertion failure. It does not start Redis itself. After the command exits, remove only the test endpoint variables from the current shell. If you started the foreground `redis-server` command above, stop that process with Ctrl+C in its terminal. Do not stop a shared service:

```powershell
Remove-Item Env:COLLABORATION_TEST_REDIS_URL -ErrorAction SilentlyContinue
Remove-Item Env:COLLABORATION_TEST_DATABASE_URL -ErrorAction SilentlyContinue
```

Expected result: the single integration test passes and reports either `PostgreSQL persistence` or `in-memory persistence`. In-memory mode verifies real Redis synchronization and Hocuspocus persistence-hook behavior, but is not a PostgreSQL integration result. This command does not verify real browsers, a deployed WebSocket load balancer, or a Redis server outage at the service/network level.

No production deployment or environment changes are performed by the test or this repository change.
