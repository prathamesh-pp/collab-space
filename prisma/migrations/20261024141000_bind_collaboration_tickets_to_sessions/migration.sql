ALTER TABLE "CollaborationTicket"
ADD COLUMN "sessionId" TEXT,
ADD COLUMN "consumedAt" TIMESTAMP(3);

CREATE INDEX "CollaborationTicket_sessionId_idx"
ON "CollaborationTicket"("sessionId");

ALTER TABLE "CollaborationTicket"
ADD CONSTRAINT "CollaborationTicket_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "Session"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
