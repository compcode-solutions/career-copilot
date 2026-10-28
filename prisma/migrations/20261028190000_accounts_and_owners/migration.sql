-- Phase 3, Migration A (ADR 0001 + 0002): Better Auth's tables, and a
-- nullable owner on the applications aggregate and jobs. Existing rows stay
-- unowned (invisible through forUser) until the operator claims the install
-- (src/lib/db/claim-install.ts). Migration B makes userId required later.

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Application" ADD COLUMN "userId" TEXT;

-- CreateIndex
CREATE INDEX "Application_userId_idx" ON "Application"("userId");

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "StatusEvent" ADD COLUMN "userId" TEXT;

-- CreateIndex
CREATE INDEX "StatusEvent_userId_idx" ON "StatusEvent"("userId");

-- AddForeignKey
ALTER TABLE "StatusEvent" ADD CONSTRAINT "StatusEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "userId" TEXT;

-- CreateIndex
CREATE INDEX "Document_userId_idx" ON "Document"("userId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "DocumentVersion" ADD COLUMN "userId" TEXT;

-- CreateIndex
CREATE INDEX "DocumentVersion_userId_idx" ON "DocumentVersion"("userId");

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN "userId" TEXT;

-- CreateIndex
CREATE INDEX "ChatMessage_userId_idx" ON "ChatMessage"("userId");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Note" ADD COLUMN "userId" TEXT;

-- CreateIndex
CREATE INDEX "Note_userId_idx" ON "Note"("userId");

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "userId" TEXT;

-- CreateIndex
CREATE INDEX "Job_userId_idx" ON "Job"("userId");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- An owned row may only point to a parent of the same owner (ADR 0002: "a
-- child can never be attached to another user's parent"). Enforced here, not
-- only in the scoped client, so it also holds inside transactions and nested
-- writes. Rows without an owner (before the install is claimed) are skipped.
-- TG_ARGV: the parent table, the foreign-key column.
CREATE FUNCTION "owner_matches_parent"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    parent_id TEXT := to_jsonb(NEW) ->> TG_ARGV[1];
    parent_owner TEXT;
BEGIN
    IF NEW."userId" IS NULL OR parent_id IS NULL THEN
        RETURN NEW;
    END IF;
    EXECUTE format('SELECT "userId" FROM %I WHERE "id" = $1', TG_ARGV[0]) INTO parent_owner USING parent_id;
    IF parent_owner IS DISTINCT FROM NEW."userId" THEN
        RAISE EXCEPTION 'owner mismatch: %.% must point to a % row of the same owner', TG_TABLE_NAME, TG_ARGV[1], TG_ARGV[0]
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "StatusEvent_owner_check" BEFORE INSERT OR UPDATE OF "userId", "applicationId" ON "StatusEvent"
    FOR EACH ROW EXECUTE FUNCTION "owner_matches_parent"('Application', 'applicationId');
CREATE TRIGGER "Document_owner_check" BEFORE INSERT OR UPDATE OF "userId", "applicationId" ON "Document"
    FOR EACH ROW EXECUTE FUNCTION "owner_matches_parent"('Application', 'applicationId');
CREATE TRIGGER "DocumentVersion_owner_check" BEFORE INSERT OR UPDATE OF "userId", "documentId" ON "DocumentVersion"
    FOR EACH ROW EXECUTE FUNCTION "owner_matches_parent"('Document', 'documentId');
CREATE TRIGGER "ChatMessage_owner_check" BEFORE INSERT OR UPDATE OF "userId", "applicationId" ON "ChatMessage"
    FOR EACH ROW EXECUTE FUNCTION "owner_matches_parent"('Application', 'applicationId');
CREATE TRIGGER "Note_owner_check" BEFORE INSERT OR UPDATE OF "userId", "applicationId" ON "Note"
    FOR EACH ROW EXECUTE FUNCTION "owner_matches_parent"('Application', 'applicationId');
CREATE TRIGGER "Job_owner_check" BEFORE INSERT OR UPDATE OF "userId", "applicationId" ON "Job"
    FOR EACH ROW EXECUTE FUNCTION "owner_matches_parent"('Application', 'applicationId');
