const TEST_DATABASE_HOST = "ep-muddy-thunder-b4hdbzfm.c-6.us-east-2.aws.neon.tech";
const TEST_DATABASE_NAME = "collabry_test";
const TEST_DATABASE_ROLE = "neondb_owner";
const REQUIRED_QUERY_PARAMETERS = new Map([
  ["sslmode", "require"],
  ["channel_binding", "require"],
]);
const OPTIONAL_STRICT_QUERY_PARAMETERS = new Map([["sslaccept", "strict"]]);

export type SanitizedPostgresTestContext =
  | "PostgreSQL version-history fixture setup"
  | "PostgreSQL version-history verification"
  | "Redis collaboration fixture setup"
  | "Redis collaboration verification";

/** Validates the one Neon database that PostgreSQL integration tests may modify. */
export function requireCollaborationTestDatabaseUrl(value: string | undefined): string {
  if (!value) {
    throw new Error("COLLABORATION_TEST_DATABASE_URL must be set to the allowlisted Neon test database.");
  }

  if (value !== value.trim()) {
    throw new Error("COLLABORATION_TEST_DATABASE_URL must not contain surrounding whitespace.");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("COLLABORATION_TEST_DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("COLLABORATION_TEST_DATABASE_URL must use PostgreSQL.");
  }

  if (parsed.hostname !== TEST_DATABASE_HOST) {
    throw new Error("COLLABORATION_TEST_DATABASE_URL must use the allowlisted Neon test endpoint.");
  }

  if (parsed.pathname !== `/${TEST_DATABASE_NAME}`) {
    throw new Error("COLLABORATION_TEST_DATABASE_URL must target the dedicated collabry_test database.");
  }

  if (parsed.username !== TEST_DATABASE_ROLE || !parsed.password) {
    throw new Error("COLLABORATION_TEST_DATABASE_URL must use the allowlisted PostgreSQL test role and explicit credentials.");
  }

  if ((parsed.port !== "" && parsed.port !== "5432") || parsed.hash !== "") {
    throw new Error("COLLABORATION_TEST_DATABASE_URL must use the allowlisted endpoint and default PostgreSQL port.");
  }

  const rawQuery = parsed.search.slice(1);
  if (!rawQuery) {
    throw new Error("COLLABORATION_TEST_DATABASE_URL must require strict PostgreSQL TLS.");
  }

  const seen = new Set<string>();
  const rawParameters = rawQuery.split("&");
  const maximumParameters = REQUIRED_QUERY_PARAMETERS.size + OPTIONAL_STRICT_QUERY_PARAMETERS.size;
  if (rawParameters.length < REQUIRED_QUERY_PARAMETERS.size || rawParameters.length > maximumParameters) {
    throw new Error("COLLABORATION_TEST_DATABASE_URL contains missing or unapproved query parameters.");
  }

  for (const parameter of rawParameters) {
    const separator = parameter.indexOf("=");
    if (separator <= 0) {
      throw new Error("COLLABORATION_TEST_DATABASE_URL contains an invalid query parameter.");
    }

    const name = parameter.slice(0, separator);
    const rawValue = parameter.slice(separator + 1);
    const expectedValue = REQUIRED_QUERY_PARAMETERS.get(name) ?? OPTIONAL_STRICT_QUERY_PARAMETERS.get(name);
    const values = parsed.searchParams.getAll(name);
    if (
      expectedValue === undefined ||
      seen.has(name) ||
      values.length !== 1 ||
      rawValue !== values[0] ||
      values[0] !== expectedValue
    ) {
      throw new Error("COLLABORATION_TEST_DATABASE_URL contains missing, duplicate, encoded, or unapproved query parameters.");
    }
    seen.add(name);
  }

  if ([...REQUIRED_QUERY_PARAMETERS.keys()].some((name) => !seen.has(name))) {
    throw new Error("COLLABORATION_TEST_DATABASE_URL must include the required strict TLS parameters.");
  }

  // Neon omits sslaccept from its canonical URL. Prisma 6 defaults this
  // parameter to accept_invalid_certs, so add the documented strict setting
  // after validating every supplied parameter and before passing the URL on.
  return seen.has("sslaccept") ? value : `${value}&sslaccept=strict`;
}

/** Replaces a raw integration error so test output cannot disclose connection details. */
export async function withSanitizedIntegrationErrors<T>(
  context: SanitizedPostgresTestContext,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new Error(`${context} failed; sensitive diagnostic details were suppressed.`);
  }
}
