import assert from "node:assert/strict";
import test from "node:test";
import {
  requireCollaborationTestDatabaseUrl,
  withSanitizedIntegrationErrors,
} from "./postgres-test-database";

const hostname = "ep-muddy-thunder-b4hdbzfm.c-6.us-east-2.aws.neon.tech";
const credentials = "neondb_owner:test-password";
const databasePath = `${hostname}/collabry_test`;
const strictQuery = "sslmode=require&sslaccept=strict&channel_binding=require";
const validUrl = `postgresql://${credentials}@${databasePath}?${strictQuery}`;

test("distinguishes a missing test URL from surrounding whitespace", () => {
  assert.throws(
    () => requireCollaborationTestDatabaseUrl(undefined),
    { message: "COLLABORATION_TEST_DATABASE_URL must be set to the allowlisted Neon test database." },
  );
  assert.throws(
    () => requireCollaborationTestDatabaseUrl(""),
    { message: "COLLABORATION_TEST_DATABASE_URL must be set to the allowlisted Neon test database." },
  );
  assert.throws(
    () => requireCollaborationTestDatabaseUrl(` ${validUrl}`),
    { message: "COLLABORATION_TEST_DATABASE_URL must not contain surrounding whitespace." },
  );
});

test("accepts the allowlisted direct Neon URL with strict TLS and channel binding", () => {
  assert.equal(requireCollaborationTestDatabaseUrl(validUrl), validUrl);
  const canonicalNeonUrl = `postgresql://${credentials}@${databasePath}?sslmode=require&channel_binding=require`;
  assert.equal(
    requireCollaborationTestDatabaseUrl(canonicalNeonUrl),
    `${canonicalNeonUrl}&sslaccept=strict`,
  );
  const reordered = `postgres://${credentials}@${databasePath}?channel_binding=require&sslaccept=strict&sslmode=require`;
  assert.equal(requireCollaborationTestDatabaseUrl(reordered), reordered);
});

test("rejects every hostname except the exact test endpoint", () => {
  for (const host of [
    "localhost",
    "127.0.0.1",
    "[::1]",
    "ep-production.c-6.us-east-2.aws.neon.tech",
    "ep-unknown.us-east-2.aws.neon.tech",
    hostname.replace(".c-6.", "-pooler.c-6."),
    hostname.toUpperCase(),
  ]) {
    assert.throws(() => requireCollaborationTestDatabaseUrl(
      `postgresql://${credentials}@${host}/collabry_test?${strictQuery}`,
    ));
  }
});

test("rejects every database except collabry_test, including encoded path names", () => {
  for (const database of ["neondb", "postgres", "collabry_test_extra", "%63ollabry_test"]) {
    assert.throws(() => requireCollaborationTestDatabaseUrl(
      `postgresql://${credentials}@${databasePath.replace("collabry_test", database)}?${strictQuery}`,
    ));
  }
});

test("rejects missing, repeated, encoded, case-varied, or weak TLS settings", () => {
  const invalidQueries = [
    "",
    "sslmode=require&sslaccept=strict",
    "sslmode=prefer&sslaccept=strict&channel_binding=require",
    "sslmode=disable&sslaccept=strict&channel_binding=require",
    "sslmode=verify-full&sslaccept=strict&channel_binding=require",
    "sslmode=require&sslaccept=accept_invalid_certs&channel_binding=require",
    "sslmode=require&sslaccept=strict&channel_binding=prefer",
    "sslmode=require&sslmode=require&sslaccept=strict&channel_binding=require",
    "sslmode=require&sslaccept=strict&sslaccept=strict&channel_binding=require",
    "%73slmode=require&sslaccept=strict&channel_binding=require",
    "SSLMODE=require&sslaccept=strict&channel_binding=require",
    "sslmode=%72equire&sslaccept=strict&channel_binding=require",
  ];

  for (const query of invalidQueries) {
    assert.throws(() => requireCollaborationTestDatabaseUrl(
      `postgresql://${credentials}@${databasePath}?${query}`,
    ));
  }
});

test("rejects all connection-target override and unapproved query parameters", () => {
  const overrides = [
    "host=localhost",
    "host=%2Fvar%2Frun%2Fpostgresql",
    "%68ost=localhost",
    "Host=localhost",
    "hostaddr=127.0.0.1",
    "dbname=neondb",
    "port=5433",
    "options=-c%20search_path%3Dpublic",
    "service=production",
    "pgbouncer=true",
    "unknown=anything",
  ];

  for (const override of overrides) {
    assert.throws(() => requireCollaborationTestDatabaseUrl(
      `postgresql://${credentials}@${databasePath}?${strictQuery}&${override}`,
    ));
  }
});

test("rejects alternate URI ports, IPv6 authorities, and missing credentials", () => {
  assert.throws(() => requireCollaborationTestDatabaseUrl(
    `postgresql://${credentials}@${hostname}:5433/collabry_test?${strictQuery}`,
  ));
  assert.throws(() => requireCollaborationTestDatabaseUrl(
    `postgresql://${credentials}@[2001:db8::1]/collabry_test?${strictQuery}`,
  ));
  assert.throws(() => requireCollaborationTestDatabaseUrl(
    `postgresql://${hostname}/collabry_test?${strictQuery}`,
  ));
  assert.throws(() => requireCollaborationTestDatabaseUrl(
    `postgresql://other-role:test-password@${databasePath}?${strictQuery}`,
  ));
});

test("rejects malformed URLs without exposing supplied credentials", () => {
  const secretUrl = "not-a-url-with-private-user-and-super-secret";
  assert.throws(() => requireCollaborationTestDatabaseUrl(secretUrl), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.ok(!error.message.includes("private-user"));
    assert.ok(!error.message.includes("super-secret"));
    assert.ok(!error.message.includes(secretUrl));
    return true;
  });
});

test("sanitizes database operation failures before they reach the test reporter", async () => {
  const secretUrl = "postgresql://private-user:super-secret@example.invalid/neondb?sslmode=disable";
  await assert.rejects(
    withSanitizedIntegrationErrors("PostgreSQL version-history verification", async () => {
      throw new Error(`Connection failed for ${secretUrl}`);
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(
        error.message,
        "PostgreSQL version-history verification failed; sensitive diagnostic details were suppressed.",
      );
      assert.ok(!error.message.includes("private-user"));
      assert.ok(!error.message.includes("super-secret"));
      assert.ok(!error.message.includes(secretUrl));
      assert.equal("cause" in error, false);
      return true;
    },
  );
});
