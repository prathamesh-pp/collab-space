ALTER TABLE "DocumentVersion"
  ALTER COLUMN "yState" DROP NOT NULL,
  ADD COLUMN "content" JSONB;
