import { isIP } from "node:net";

export type CollaborationServerConfig = {
  port: number;
  address: string;
  allowedOrigins: ReadonlySet<string>;
};

export function loadCollaborationServerConfig(
  env: Record<string, string | undefined>,
): CollaborationServerConfig {
  const portValue = env.COLLABORATION_PORT;
  if (!portValue || !/^\d+$/.test(portValue)) {
    throw new Error("COLLABORATION_PORT must be an integer from 1 to 65535.");
  }
  const port = Number(portValue);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("COLLABORATION_PORT must be an integer from 1 to 65535.");
  }

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required by the collaboration server.");
  }
  try {
    const parsedDatabaseUrl = new URL(databaseUrl);
    if (
      parsedDatabaseUrl.protocol !== "postgres:" &&
      parsedDatabaseUrl.protocol !== "postgresql:"
    ) {
      throw new Error();
    }
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }

  const originValue = env.COLLABORATION_ALLOWED_ORIGINS;
  if (!originValue?.trim()) {
    throw new Error("COLLABORATION_ALLOWED_ORIGINS must be configured.");
  }

  const origins = originValue.split(",").map((value) => value.trim());
  const allowedOrigins = new Set<string>();
  for (const origin of origins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error("COLLABORATION_ALLOWED_ORIGINS contains an invalid origin.");
    }
    const secureOrigin = parsed.protocol === "https:";
    const localHttpOrigin =
      parsed.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    if (
      parsed.origin !== origin ||
      parsed.username ||
      parsed.password ||
      (!secureOrigin && !localHttpOrigin) ||
      allowedOrigins.has(origin)
    ) {
      throw new Error("COLLABORATION_ALLOWED_ORIGINS must contain unique HTTPS origins (or loopback HTTP origins for local development).");
    }
    allowedOrigins.add(origin);
  }

  const address = env.COLLABORATION_HOST?.trim() || "127.0.0.1";
  if (address !== "localhost" && isIP(address) === 0) {
    throw new Error("COLLABORATION_HOST must be localhost or an IP address.");
  }

  return { port, address, allowedOrigins };
}
