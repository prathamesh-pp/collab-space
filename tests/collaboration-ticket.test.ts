import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import test from "node:test";
import {
  consumeCollaborationTicketWith,
  isSameOriginRequest,
  type CollaborationTicketRecord,
  type CollaborationTicketRepository,
  type CollaborationTicketTransaction,
} from "../src/lib/collaboration-ticket";
import { hashToken } from "../src/lib/token";

const now = new Date("2026-10-24T12:00:00.000Z");
const ticketToken = "a".repeat(43);
const ticketHash = hashToken(ticketToken);

function makeTicket(
  overrides: Partial<CollaborationTicketRecord> = {},
): CollaborationTicketRecord {
  return {
    id: "ticket-1",
    documentId: "document-1",
    userId: "user-1",
    sessionId: "session-1",
    workspaceId: "workspace-1",
    expiresAt: new Date(now.getTime() + 30_000),
    consumedAt: null,
    session: {
      id: "session-1",
      userId: "user-1",
      expiresAt: new Date(now.getTime() + 60_000),
    },
    role: "EDITOR",
    ...overrides,
  };
}

class MemoryTicketRepository implements CollaborationTicketRepository {
  ticket: CollaborationTicketRecord | null = makeTicket();
  membershipRole: string | null = "EDITOR";
  beforeFindTicket?: () => Promise<void>;
  private ticketHash = ticketHash;

  async transaction<T>(
    callback: (transaction: CollaborationTicketTransaction) => Promise<T>,
  ): Promise<T> {
    return callback({
      findTicket: async (tokenHash, at) => {
        await this.beforeFindTicket?.();
        const ticket = this.ticket;
        if (
          tokenHash !== this.ticketHash ||
          !ticket ||
          !ticket.sessionId ||
          ticket.consumedAt ||
          ticket.expiresAt <= at
        ) {
          return null;
        }
        return structuredClone(ticket);
      },
      findMembership: async (workspaceId, userId) => {
        if (workspaceId !== "workspace-1" || userId !== "user-1") {
          return null;
        }
        return this.membershipRole;
      },
      consumeTicket: async (id, tokenHash, sessionId, at) => {
        const current = this.ticket;
        if (
          !current ||
          current.id !== id ||
          this.ticketHash !== tokenHash ||
          current.sessionId !== sessionId ||
          current.consumedAt ||
          current.expiresAt <= at
        ) {
          return false;
        }
        this.ticket = { ...current, consumedAt: at };
        return true;
      },
    });
  }
}

function sameOriginRequest(
  origin: string | null,
  url = "https://app.example.test/api/ticket",
) {
  const headers = new Headers();
  if (origin !== null) headers.set("origin", origin);
  return new Request(url, { headers });
}

test("ticket tokens are stored as a cryptographic SHA-256 digest", () => {
  assert.equal(
    hashToken(ticketToken),
    createHash("sha256").update(ticketToken).digest("hex"),
  );
  assert.notEqual(hashToken(ticketToken), ticketToken);
  assert.equal(hashToken(ticketToken).length, 64);
});

test("a ticket can be consumed once and replay is rejected", async () => {
  const repository = new MemoryTicketRepository();

  assert.deepEqual(
    await consumeCollaborationTicketWith(
      ticketToken,
      "document-1",
      repository,
      now,
    ),
    { documentId: "document-1", userId: "user-1", role: "EDITOR" },
  );
  assert.equal(
    await consumeCollaborationTicketWith(
      ticketToken,
      "document-1",
      repository,
      now,
    ),
    null,
  );
});

test("concurrent attempts to consume one ticket have at most one success", async () => {
  const repository = new MemoryTicketRepository();
  let readers = 0;
  let releaseReaders!: () => void;
  const bothReadersReady = new Promise<void>((resolve) => {
    releaseReaders = resolve;
  });
  repository.beforeFindTicket = async () => {
    readers += 1;
    if (readers === 2) releaseReaders();
    await bothReadersReady;
  };

  const results = await Promise.all([
    consumeCollaborationTicketWith(ticketToken, "document-1", repository, now),
    consumeCollaborationTicketWith(ticketToken, "document-1", repository, now),
  ]);

  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(repository.ticket?.consumedAt?.getTime(), now.getTime());
});

test("simulated Prisma serialization conflict fails consumption without retry", async () => {
  let transactionAttempts = 0;
  const repository: CollaborationTicketRepository = {
    transaction: async () => {
      transactionAttempts += 1;
      throw new Prisma.PrismaClientKnownRequestError(
        "Simulated serialization conflict",
        { code: "P2034", clientVersion: "test" },
      );
    },
  };

  assert.equal(
    await consumeCollaborationTicketWith(
      ticketToken,
      "document-1",
      repository,
      now,
    ),
    null,
  );
  assert.equal(transactionAttempts, 1);
});

test("non-serialization transaction failures are not swallowed", async () => {
  const failure = new Error("Unexpected transaction failure");
  const repository: CollaborationTicketRepository = {
    transaction: async () => {
      throw failure;
    },
  };

  await assert.rejects(
    consumeCollaborationTicketWith(
      ticketToken,
      "document-1",
      repository,
      now,
    ),
    failure,
  );
});

test("expired tickets and malformed tokens are rejected", async () => {
  const repository = new MemoryTicketRepository();
  repository.ticket = makeTicket({ expiresAt: now });
  assert.equal(
    await consumeCollaborationTicketWith(ticketToken, "document-1", repository, now),
    null,
  );
  assert.equal(
    await consumeCollaborationTicketWith("malformed", "document-1", repository, now),
    null,
  );
});

test("revoked, invalid, and expired sessions are rejected", async (context) => {
  for (const [label, session] of [
    ["revoked", null],
    [
      "wrong session",
      {
        id: "other-session",
        userId: "user-1",
        expiresAt: new Date(now.getTime() + 60_000),
      },
    ],
    [
      "wrong user",
      {
        id: "session-1",
        userId: "other-user",
        expiresAt: new Date(now.getTime() + 60_000),
      },
    ],
    [
      "expired",
      { id: "session-1", userId: "user-1", expiresAt: now },
    ],
  ] as const) {
    await context.test(label, async () => {
      const repository = new MemoryTicketRepository();
      repository.ticket = makeTicket({ session });
      assert.equal(
        await consumeCollaborationTicketWith(
          ticketToken,
          "document-1",
          repository,
          now,
        ),
        null,
      );
    });
  }
});

test("document mismatch and removed or changed memberships are rejected", async (context) => {
  const cases: Array<[string, string, string | null]> = [
    ["another document", "document-2", "EDITOR"],
    ["removed membership", "document-1", null],
    ["changed to commenter", "document-1", "COMMENTER"],
    ["viewer role", "document-1", "VIEWER"],
  ];

  for (const [label, documentId, role] of cases) {
    await context.test(label, async () => {
      const repository = new MemoryTicketRepository();
      repository.membershipRole = role;
      assert.equal(
        await consumeCollaborationTicketWith(
          ticketToken,
          documentId,
          repository,
          now,
        ),
        null,
      );
    });
  }
});

test("workspace owners and editors can collaborate while read-only roles and outsiders cannot edit", async (context) => {
  for (const role of ["OWNER", "EDITOR"] as const) {
    await context.test(`${role} member can consume a document ticket`, async () => {
      const repository = new MemoryTicketRepository();
      repository.ticket = makeTicket({ role });
      repository.membershipRole = role;
      assert.deepEqual(
        await consumeCollaborationTicketWith(ticketToken, "document-1", repository, now),
        { documentId: "document-1", userId: "user-1", role },
      );
    });
  }

  for (const role of ["COMMENTER", "VIEWER", null] as const) {
    await context.test(`${role ?? "nonmember"} cannot consume an edit ticket`, async () => {
      const repository = new MemoryTicketRepository();
      repository.membershipRole = role;
      assert.equal(
        await consumeCollaborationTicketWith(ticketToken, "document-1", repository, now),
        null,
      );
    });
  }
});

test("same-origin checks reject foreign and missing origins", () => {
  assert.equal(
    isSameOriginRequest(sameOriginRequest("https://app.example.test")),
    true,
  );
  assert.equal(
    isSameOriginRequest(sameOriginRequest("https://attacker.example")),
    false,
  );
  assert.equal(isSameOriginRequest(sameOriginRequest(null)), false);
});
