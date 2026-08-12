-- CreateEnum
CREATE TYPE "FormStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FormAudience" AS ENUM ('PUBLIC', 'MEMBERS');

-- CreateEnum
CREATE TYPE "FormLocaleMode" AS ENUM ('BOTH', 'NL_ONLY', 'EN_ONLY');

-- CreateEnum
CREATE TYPE "FormFieldType" AS ENUM ('SHORT_TEXT', 'LONG_TEXT', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'DROPDOWN', 'BOOLEAN', 'EMAIL', 'NUMBER', 'DATE', 'TIME', 'PHONE', 'URL', 'SCALE', 'FILE', 'CONSENT', 'PROFILE');

-- CreateEnum
CREATE TYPE "FormFieldConditionOperator" AS ENUM ('EQUALS', 'NOT_EQUALS', 'INCLUDES', 'IS_ANSWERED');

-- CreateEnum
CREATE TYPE "FormGrantRole" AS ENUM ('VIEWER', 'EDITOR', 'MANAGER');

-- CreateEnum
CREATE TYPE "FormGroupGrantScope" AS ENUM ('ALL_MEMBERS', 'LEADS_ONLY');

-- CreateEnum
CREATE TYPE "FormEntryStatus" AS ENUM ('DRAFT', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "FormReviewStatus" AS ENUM ('NEW', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "FormNotifyMode" AS ENUM ('NONE', 'EACH', 'DAILY');

-- CreateEnum
CREATE TYPE "FormOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'DEAD');

-- CreateTable
CREATE TABLE "Form" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "calendarEventId" TEXT,
    "ownerGroupId" TEXT NOT NULL,
    "createdById" TEXT,
    "titleNl" TEXT NOT NULL,
    "titleEn" TEXT,
    "introNl" TEXT,
    "introEn" TEXT,
    "status" "FormStatus" NOT NULL DEFAULT 'DRAFT',
    "audience" "FormAudience" NOT NULL DEFAULT 'PUBLIC',
    "listed" BOOLEAN NOT NULL DEFAULT true,
    "localeMode" "FormLocaleMode" NOT NULL DEFAULT 'BOTH',
    "unavailableNl" TEXT,
    "unavailableEn" TEXT,
    "opensAt" TIMESTAMPTZ(3),
    "closesAt" TIMESTAMPTZ(3),
    "timeZone" TEXT NOT NULL DEFAULT 'Europe/Brussels',
    "maxEntries" INTEGER,
    "allowMultipleSubmissions" BOOLEAN NOT NULL DEFAULT false,
    "allowEditAfterSubmit" BOOLEAN NOT NULL DEFAULT false,
    "allowDrafts" BOOLEAN NOT NULL DEFAULT false,
    "confirmationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "confirmationSubjectNl" TEXT,
    "confirmationSubjectEn" TEXT,
    "confirmationBodyNl" TEXT,
    "confirmationBodyEn" TEXT,
    "confirmationIncludeAnswers" BOOLEAN NOT NULL DEFAULT true,
    "confirmationIncludeIcs" BOOLEAN NOT NULL DEFAULT false,
    "notifyMode" "FormNotifyMode" NOT NULL DEFAULT 'NONE',
    "notifyEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "thankYouNl" TEXT,
    "thankYouEn" TEXT,
    "requireConsent" BOOLEAN NOT NULL DEFAULT false,
    "consentTextNl" TEXT,
    "consentTextEn" TEXT,
    "retentionDays" INTEGER,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "publishedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Form_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormSection" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "titleNl" TEXT NOT NULL,
    "titleEn" TEXT,
    "descriptionNl" TEXT,
    "descriptionEn" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FormSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormField" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "sectionId" TEXT,
    "code" TEXT NOT NULL,
    "type" "FormFieldType" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "labelNl" TEXT NOT NULL,
    "labelEn" TEXT,
    "helpNl" TEXT,
    "helpEn" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FormField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormFieldOption" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "labelNl" TEXT NOT NULL,
    "labelEn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "quotaLimit" INTEGER,
    "quotaUsed" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FormFieldOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormFieldCondition" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "sourceFieldId" TEXT NOT NULL,
    "operator" "FormFieldConditionOperator" NOT NULL DEFAULT 'EQUALS',
    "value" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormFieldCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormEntry" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "status" "FormEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewStatus" "FormReviewStatus" NOT NULL DEFAULT 'NEW',
    "reviewerId" TEXT,
    "internalNote" TEXT,
    "submittedById" TEXT,
    "submitterName" TEXT,
    "submitterEmail" TEXT,
    "locale" "Locale" NOT NULL DEFAULT 'NL',
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "requestFingerprint" TEXT,
    "submittedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FormEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormAnswer" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "fieldCode" TEXT NOT NULL,
    "valueText" TEXT,
    "valueNumber" DOUBLE PRECISION,
    "valueDate" TIMESTAMPTZ(3),
    "valueBool" BOOLEAN,
    "valueOptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "otherText" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FormAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormFileUpload" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "contentType" TEXT,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormFileUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormUserGrant" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "FormGrantRole" NOT NULL,
    "grantedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormUserGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormGroupGrant" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "role" "FormGrantRole" NOT NULL,
    "scope" "FormGroupGrantScope" NOT NULL DEFAULT 'ALL_MEMBERS',
    "grantedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormGroupGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormAuditLog" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "ipAddress" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormOutboxMessage" (
    "id" TEXT NOT NULL,
    "formId" TEXT,
    "entryId" TEXT,
    "type" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "recipient" TEXT,
    "payload" JSONB NOT NULL,
    "status" "FormOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMPTZ(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "sentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FormOutboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Form_slug_key" ON "Form"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Form_calendarEventId_key" ON "Form"("calendarEventId");

-- CreateIndex
CREATE INDEX "Form_ownerGroupId_idx" ON "Form"("ownerGroupId");

-- CreateIndex
CREATE INDEX "Form_status_opensAt_closesAt_idx" ON "Form"("status", "opensAt", "closesAt");

-- CreateIndex
CREATE INDEX "FormSection_formId_sortOrder_idx" ON "FormSection"("formId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "FormSection_id_formId_key" ON "FormSection"("id", "formId");

-- CreateIndex
CREATE INDEX "FormField_formId_sortOrder_idx" ON "FormField"("formId", "sortOrder");

-- CreateIndex
CREATE INDEX "FormField_sectionId_idx" ON "FormField"("sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "FormField_formId_code_key" ON "FormField"("formId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "FormField_id_formId_key" ON "FormField"("id", "formId");

-- CreateIndex
CREATE INDEX "FormFieldOption_formId_idx" ON "FormFieldOption"("formId");

-- CreateIndex
CREATE INDEX "FormFieldOption_fieldId_sortOrder_idx" ON "FormFieldOption"("fieldId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "FormFieldOption_fieldId_code_key" ON "FormFieldOption"("fieldId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "FormFieldOption_id_formId_key" ON "FormFieldOption"("id", "formId");

-- CreateIndex
CREATE INDEX "FormFieldCondition_formId_idx" ON "FormFieldCondition"("formId");

-- CreateIndex
CREATE INDEX "FormFieldCondition_fieldId_idx" ON "FormFieldCondition"("fieldId");

-- CreateIndex
CREATE INDEX "FormFieldCondition_sourceFieldId_idx" ON "FormFieldCondition"("sourceFieldId");

-- CreateIndex
CREATE INDEX "FormEntry_formId_status_submittedAt_idx" ON "FormEntry"("formId", "status", "submittedAt");

-- CreateIndex
CREATE INDEX "FormEntry_formId_submittedById_idx" ON "FormEntry"("formId", "submittedById");

-- CreateIndex
CREATE INDEX "FormEntry_submittedById_idx" ON "FormEntry"("submittedById");

-- CreateIndex
CREATE INDEX "FormEntry_reviewerId_idx" ON "FormEntry"("reviewerId");

-- CreateIndex
CREATE INDEX "FormEntry_submitterEmail_idx" ON "FormEntry"("submitterEmail");

-- CreateIndex
CREATE UNIQUE INDEX "FormEntry_id_formId_key" ON "FormEntry"("id", "formId");

-- CreateIndex
CREATE INDEX "FormAnswer_formId_fieldId_idx" ON "FormAnswer"("formId", "fieldId");

-- CreateIndex
CREATE INDEX "FormAnswer_entryId_idx" ON "FormAnswer"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "FormAnswer_entryId_fieldId_key" ON "FormAnswer"("entryId", "fieldId");

-- CreateIndex
CREATE INDEX "FormFileUpload_entryId_idx" ON "FormFileUpload"("entryId");

-- CreateIndex
CREATE INDEX "FormFileUpload_formId_fieldId_idx" ON "FormFileUpload"("formId", "fieldId");

-- CreateIndex
CREATE INDEX "FormUserGrant_userId_idx" ON "FormUserGrant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FormUserGrant_formId_userId_key" ON "FormUserGrant"("formId", "userId");

-- CreateIndex
CREATE INDEX "FormGroupGrant_groupId_idx" ON "FormGroupGrant"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "FormGroupGrant_formId_groupId_key" ON "FormGroupGrant"("formId", "groupId");

-- CreateIndex
CREATE INDEX "FormAuditLog_formId_createdAt_idx" ON "FormAuditLog"("formId", "createdAt");

-- CreateIndex
CREATE INDEX "FormAuditLog_formId_entityType_entityId_idx" ON "FormAuditLog"("formId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "FormAuditLog_actorUserId_idx" ON "FormAuditLog"("actorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "FormOutboxMessage_dedupeKey_key" ON "FormOutboxMessage"("dedupeKey");

-- CreateIndex
CREATE INDEX "FormOutboxMessage_status_availableAt_idx" ON "FormOutboxMessage"("status", "availableAt");

-- CreateIndex
CREATE INDEX "FormOutboxMessage_formId_idx" ON "FormOutboxMessage"("formId");

-- AddForeignKey
ALTER TABLE "Form" ADD CONSTRAINT "Form_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "CalendarEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Form" ADD CONSTRAINT "Form_ownerGroupId_fkey" FOREIGN KEY ("ownerGroupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Form" ADD CONSTRAINT "Form_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSection" ADD CONSTRAINT "FormSection_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormField" ADD CONSTRAINT "FormField_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormField" ADD CONSTRAINT "FormField_sectionId_formId_fkey" FOREIGN KEY ("sectionId", "formId") REFERENCES "FormSection"("id", "formId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormFieldOption" ADD CONSTRAINT "FormFieldOption_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormFieldOption" ADD CONSTRAINT "FormFieldOption_fieldId_formId_fkey" FOREIGN KEY ("fieldId", "formId") REFERENCES "FormField"("id", "formId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormFieldCondition" ADD CONSTRAINT "FormFieldCondition_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormFieldCondition" ADD CONSTRAINT "FormFieldCondition_fieldId_formId_fkey" FOREIGN KEY ("fieldId", "formId") REFERENCES "FormField"("id", "formId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormFieldCondition" ADD CONSTRAINT "FormFieldCondition_sourceFieldId_formId_fkey" FOREIGN KEY ("sourceFieldId", "formId") REFERENCES "FormField"("id", "formId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormEntry" ADD CONSTRAINT "FormEntry_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormEntry" ADD CONSTRAINT "FormEntry_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormEntry" ADD CONSTRAINT "FormEntry_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormAnswer" ADD CONSTRAINT "FormAnswer_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormAnswer" ADD CONSTRAINT "FormAnswer_entryId_formId_fkey" FOREIGN KEY ("entryId", "formId") REFERENCES "FormEntry"("id", "formId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormAnswer" ADD CONSTRAINT "FormAnswer_fieldId_formId_fkey" FOREIGN KEY ("fieldId", "formId") REFERENCES "FormField"("id", "formId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormFileUpload" ADD CONSTRAINT "FormFileUpload_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormFileUpload" ADD CONSTRAINT "FormFileUpload_entryId_formId_fkey" FOREIGN KEY ("entryId", "formId") REFERENCES "FormEntry"("id", "formId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormFileUpload" ADD CONSTRAINT "FormFileUpload_fieldId_formId_fkey" FOREIGN KEY ("fieldId", "formId") REFERENCES "FormField"("id", "formId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormUserGrant" ADD CONSTRAINT "FormUserGrant_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormUserGrant" ADD CONSTRAINT "FormUserGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormUserGrant" ADD CONSTRAINT "FormUserGrant_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormGroupGrant" ADD CONSTRAINT "FormGroupGrant_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormGroupGrant" ADD CONSTRAINT "FormGroupGrant_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormGroupGrant" ADD CONSTRAINT "FormGroupGrant_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormAuditLog" ADD CONSTRAINT "FormAuditLog_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormAuditLog" ADD CONSTRAINT "FormAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormOutboxMessage" ADD CONSTRAINT "FormOutboxMessage_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;
