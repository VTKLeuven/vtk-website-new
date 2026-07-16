-- CreateEnum
CREATE TYPE "TicketEventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SALES_PAUSED', 'SALES_CLOSED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TicketAudience" AS ENUM ('PUBLIC', 'MEMBERS');

-- CreateEnum
CREATE TYPE "TicketQuestionType" AS ENUM ('SHORT_TEXT', 'LONG_TEXT', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'BOOLEAN');

-- CreateEnum
CREATE TYPE "TicketGrantRole" AS ENUM ('OWNER', 'MANAGER', 'FINANCE', 'SCANNER', 'REPORTER');

-- CreateEnum
CREATE TYPE "TicketGroupGrantScope" AS ENUM ('ALL_MEMBERS', 'LEADS_ONLY');

-- CreateEnum
CREATE TYPE "TicketOrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'PAYMENT_FAILED', 'EXPIRED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "TicketPaymentStatus" AS ENUM ('CREATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TicketRefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('VALID', 'VOID', 'REFUNDED');

-- CreateEnum
CREATE TYPE "TicketScanResult" AS ENUM ('ACCEPTED', 'ALREADY_USED', 'WRONG_EVENT', 'INVALID', 'VOID', 'REFUNDED', 'EXPIRED', 'REVERSED');

-- CreateEnum
CREATE TYPE "TicketOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'DEAD');

-- CreateTable
CREATE TABLE "TicketEvent" (
    "id" TEXT NOT NULL,
    "calendarEventId" TEXT,
    "ownerGroupId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titleNl" TEXT NOT NULL,
    "titleEn" TEXT,
    "descriptionNl" TEXT,
    "descriptionEn" TEXT,
    "location" TEXT,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'Europe/Brussels',
    "salesStartAt" TIMESTAMPTZ(3),
    "salesEndAt" TIMESTAMPTZ(3),
    "status" "TicketEventStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "maxTicketsPerOrder" INTEGER NOT NULL DEFAULT 8,
    "contactEmail" TEXT,
    "termsUrl" TEXT,
    "termsVersion" TEXT,
    "confirmationMessageNl" TEXT,
    "confirmationMessageEn" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "publishedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TicketEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketInventoryPool" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameNl" TEXT NOT NULL,
    "nameEn" TEXT,
    "capacity" INTEGER NOT NULL,
    "reservedCount" INTEGER NOT NULL DEFAULT 0,
    "soldCount" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TicketInventoryPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketType" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "inventoryPoolId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameNl" TEXT NOT NULL,
    "nameEn" TEXT,
    "descriptionNl" TEXT,
    "descriptionEn" TEXT,
    "unitPriceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "audience" "TicketAudience" NOT NULL DEFAULT 'PUBLIC',
    "salesStartAt" TIMESTAMPTZ(3),
    "salesEndAt" TIMESTAMPTZ(3),
    "minPerOrder" INTEGER NOT NULL DEFAULT 1,
    "maxPerOrder" INTEGER NOT NULL DEFAULT 8,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TicketType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketQuestion" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ticketTypeId" TEXT,
    "code" TEXT NOT NULL,
    "labelNl" TEXT NOT NULL,
    "labelEn" TEXT,
    "descriptionNl" TEXT,
    "descriptionEn" TEXT,
    "type" "TicketQuestionType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TicketQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketEventUserGrant" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TicketGrantRole" NOT NULL,
    "grantedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketEventUserGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketEventGroupGrant" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "role" "TicketGrantRole" NOT NULL,
    "scope" "TicketGroupGrantScope" NOT NULL DEFAULT 'ALL_MEMBERS',
    "grantedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketEventGroupGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketOrder" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "accessTokenHash" TEXT NOT NULL,
    "accessExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "requestFingerprint" TEXT,
    "buyerUserId" TEXT,
    "buyerName" TEXT NOT NULL,
    "buyerEmail" TEXT NOT NULL,
    "locale" "Locale" NOT NULL DEFAULT 'NL',
    "status" "TicketOrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "subtotalCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "refundedCents" INTEGER NOT NULL DEFAULT 0,
    "reservationExpiresAt" TIMESTAMPTZ(3),
    "termsAcceptedAt" TIMESTAMPTZ(3),
    "termsVersion" TEXT,
    "paidAt" TIMESTAMPTZ(3),
    "failedAt" TIMESTAMPTZ(3),
    "expiredAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TicketOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketOrderItem" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "ticketTypeId" TEXT NOT NULL,
    "inventoryPoolId" TEXT NOT NULL,
    "ticketTypeCode" TEXT NOT NULL,
    "ticketTypeName" TEXT NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "attendeeName" TEXT NOT NULL,
    "attendeeEmail" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketOrderItemAnswer" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "questionCode" TEXT NOT NULL,
    "questionLabel" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketOrderItemAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketPayment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerCheckoutId" TEXT,
    "providerPaymentId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" "TicketPaymentStatus" NOT NULL DEFAULT 'CREATED',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "checkoutUrl" TEXT,
    "providerStatus" TEXT,
    "expiresAt" TIMESTAMPTZ(3),
    "succeededAt" TIMESTAMPTZ(3),
    "failedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TicketPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketPaymentWebhook" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "paymentId" TEXT,
    "signatureValid" BOOLEAN NOT NULL,
    "payload" JSONB NOT NULL,
    "processingAttempts" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),
    "lastError" TEXT,

    CONSTRAINT "TicketPaymentWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "publicCode" TEXT NOT NULL,
    "credentialHash" TEXT NOT NULL,
    "credentialVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "TicketStatus" NOT NULL DEFAULT 'VALID',
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedInAt" TIMESTAMPTZ(3),
    "checkedInById" TEXT,
    "voidedAt" TIMESTAMPTZ(3),
    "refundedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketRefund" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRefundId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" "TicketRefundStatus" NOT NULL DEFAULT 'PENDING',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "reason" TEXT,
    "requestedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "TicketRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketRefundItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,

    CONSTRAINT "TicketRefundItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketGate" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TicketGate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketScanDevice" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdById" TEXT,
    "lastSeenAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TicketScanDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketScanLog" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ticketId" TEXT,
    "scannerUserId" TEXT,
    "deviceId" TEXT,
    "gateId" TEXT,
    "clientScanId" TEXT NOT NULL,
    "result" "TicketScanResult" NOT NULL,
    "credentialFingerprint" TEXT,
    "scannedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientScannedAt" TIMESTAMPTZ(3),
    "reversesScanId" TEXT,
    "metadata" JSONB,

    CONSTRAINT "TicketScanLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketAuditLog" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "ipAddress" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketOutboxMessage" (
    "id" TEXT NOT NULL,
    "eventId" TEXT,
    "orderId" TEXT,
    "type" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "recipient" TEXT,
    "payload" JSONB NOT NULL,
    "status" "TicketOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMPTZ(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "sentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TicketOutboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TicketEvent_calendarEventId_key" ON "TicketEvent"("calendarEventId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketEvent_slug_key" ON "TicketEvent"("slug");

-- CreateIndex
CREATE INDEX "TicketEvent_ownerGroupId_idx" ON "TicketEvent"("ownerGroupId");

-- CreateIndex
CREATE INDEX "TicketEvent_status_salesStartAt_salesEndAt_idx" ON "TicketEvent"("status", "salesStartAt", "salesEndAt");

-- CreateIndex
CREATE INDEX "TicketEvent_startsAt_idx" ON "TicketEvent"("startsAt");

-- CreateIndex
CREATE INDEX "TicketInventoryPool_eventId_active_idx" ON "TicketInventoryPool"("eventId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "TicketInventoryPool_eventId_code_key" ON "TicketInventoryPool"("eventId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "TicketInventoryPool_id_eventId_key" ON "TicketInventoryPool"("id", "eventId");

-- CreateIndex
CREATE INDEX "TicketType_eventId_active_sortOrder_idx" ON "TicketType"("eventId", "active", "sortOrder");

-- CreateIndex
CREATE INDEX "TicketType_inventoryPoolId_idx" ON "TicketType"("inventoryPoolId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketType_eventId_code_key" ON "TicketType"("eventId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "TicketType_id_eventId_key" ON "TicketType"("id", "eventId");

-- CreateIndex
CREATE INDEX "TicketQuestion_eventId_active_sortOrder_idx" ON "TicketQuestion"("eventId", "active", "sortOrder");

-- CreateIndex
CREATE INDEX "TicketQuestion_ticketTypeId_idx" ON "TicketQuestion"("ticketTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketQuestion_eventId_code_key" ON "TicketQuestion"("eventId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "TicketQuestion_id_eventId_key" ON "TicketQuestion"("id", "eventId");

-- CreateIndex
CREATE INDEX "TicketEventUserGrant_userId_idx" ON "TicketEventUserGrant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketEventUserGrant_eventId_userId_key" ON "TicketEventUserGrant"("eventId", "userId");

-- CreateIndex
CREATE INDEX "TicketEventGroupGrant_groupId_idx" ON "TicketEventGroupGrant"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketEventGroupGrant_eventId_groupId_key" ON "TicketEventGroupGrant"("eventId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketOrder_reference_key" ON "TicketOrder"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "TicketOrder_accessTokenHash_key" ON "TicketOrder"("accessTokenHash");

-- CreateIndex
CREATE INDEX "TicketOrder_eventId_status_createdAt_idx" ON "TicketOrder"("eventId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "TicketOrder_eventId_requestFingerprint_createdAt_idx" ON "TicketOrder"("eventId", "requestFingerprint", "createdAt");

-- CreateIndex
CREATE INDEX "TicketOrder_buyerUserId_idx" ON "TicketOrder"("buyerUserId");

-- CreateIndex
CREATE INDEX "TicketOrder_buyerEmail_idx" ON "TicketOrder"("buyerEmail");

-- CreateIndex
CREATE INDEX "TicketOrder_status_reservationExpiresAt_idx" ON "TicketOrder"("status", "reservationExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TicketOrder_id_eventId_key" ON "TicketOrder"("id", "eventId");

-- CreateIndex
CREATE INDEX "TicketOrderItem_orderId_idx" ON "TicketOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "TicketOrderItem_eventId_ticketTypeId_idx" ON "TicketOrderItem"("eventId", "ticketTypeId");

-- CreateIndex
CREATE INDEX "TicketOrderItem_inventoryPoolId_idx" ON "TicketOrderItem"("inventoryPoolId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketOrderItem_id_eventId_key" ON "TicketOrderItem"("id", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketOrderItem_id_orderId_key" ON "TicketOrderItem"("id", "orderId");

-- CreateIndex
CREATE INDEX "TicketOrderItemAnswer_questionId_idx" ON "TicketOrderItemAnswer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketOrderItemAnswer_orderItemId_questionId_key" ON "TicketOrderItemAnswer"("orderItemId", "questionId");

-- CreateIndex
CREATE INDEX "TicketPayment_orderId_status_idx" ON "TicketPayment"("orderId", "status");

-- CreateIndex
CREATE INDEX "TicketPayment_status_expiresAt_idx" ON "TicketPayment"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TicketPayment_provider_providerCheckoutId_key" ON "TicketPayment"("provider", "providerCheckoutId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketPayment_provider_providerPaymentId_key" ON "TicketPayment"("provider", "providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketPayment_provider_idempotencyKey_key" ON "TicketPayment"("provider", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "TicketPayment_id_orderId_key" ON "TicketPayment"("id", "orderId");

-- CreateIndex
CREATE INDEX "TicketPaymentWebhook_paymentId_idx" ON "TicketPaymentWebhook"("paymentId");

-- CreateIndex
CREATE INDEX "TicketPaymentWebhook_processedAt_receivedAt_idx" ON "TicketPaymentWebhook"("processedAt", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TicketPaymentWebhook_provider_externalEventId_key" ON "TicketPaymentWebhook"("provider", "externalEventId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_orderItemId_key" ON "Ticket"("orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_publicCode_key" ON "Ticket"("publicCode");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_credentialHash_key" ON "Ticket"("credentialHash");

-- CreateIndex
CREATE INDEX "Ticket_eventId_status_idx" ON "Ticket"("eventId", "status");

-- CreateIndex
CREATE INDEX "Ticket_eventId_checkedInAt_idx" ON "Ticket"("eventId", "checkedInAt");

-- CreateIndex
CREATE INDEX "Ticket_checkedInById_idx" ON "Ticket"("checkedInById");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_id_eventId_key" ON "Ticket"("id", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_orderItemId_eventId_key" ON "Ticket"("orderItemId", "eventId");

-- CreateIndex
CREATE INDEX "TicketRefund_orderId_status_idx" ON "TicketRefund"("orderId", "status");

-- CreateIndex
CREATE INDEX "TicketRefund_paymentId_idx" ON "TicketRefund"("paymentId");

-- CreateIndex
CREATE INDEX "TicketRefund_requestedById_idx" ON "TicketRefund"("requestedById");

-- CreateIndex
CREATE UNIQUE INDEX "TicketRefund_provider_providerRefundId_key" ON "TicketRefund"("provider", "providerRefundId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketRefund_provider_idempotencyKey_key" ON "TicketRefund"("provider", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "TicketRefund_id_orderId_key" ON "TicketRefund"("id", "orderId");

-- CreateIndex
CREATE INDEX "TicketRefundItem_orderItemId_idx" ON "TicketRefundItem"("orderItemId");

-- CreateIndex
CREATE INDEX "TicketRefundItem_orderId_idx" ON "TicketRefundItem"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketRefundItem_refundId_orderItemId_key" ON "TicketRefundItem"("refundId", "orderItemId");

-- CreateIndex
CREATE INDEX "TicketGate_eventId_active_idx" ON "TicketGate"("eventId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "TicketGate_eventId_code_key" ON "TicketGate"("eventId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "TicketGate_id_eventId_key" ON "TicketGate"("id", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketScanDevice_tokenHash_key" ON "TicketScanDevice"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "TicketScanDevice_id_eventId_key" ON "TicketScanDevice"("id", "eventId");

-- CreateIndex
CREATE INDEX "TicketScanDevice_eventId_revokedAt_idx" ON "TicketScanDevice"("eventId", "revokedAt");

-- CreateIndex
CREATE INDEX "TicketScanDevice_createdById_idx" ON "TicketScanDevice"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "TicketScanLog_clientScanId_key" ON "TicketScanLog"("clientScanId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketScanLog_reversesScanId_key" ON "TicketScanLog"("reversesScanId");

-- CreateIndex
CREATE INDEX "TicketScanLog_eventId_scannedAt_idx" ON "TicketScanLog"("eventId", "scannedAt");

-- CreateIndex
CREATE INDEX "TicketScanLog_ticketId_scannedAt_idx" ON "TicketScanLog"("ticketId", "scannedAt");

-- CreateIndex
CREATE INDEX "TicketScanLog_scannerUserId_idx" ON "TicketScanLog"("scannerUserId");

-- CreateIndex
CREATE INDEX "TicketScanLog_deviceId_idx" ON "TicketScanLog"("deviceId");

-- CreateIndex
CREATE INDEX "TicketScanLog_gateId_idx" ON "TicketScanLog"("gateId");

-- CreateIndex
CREATE INDEX "TicketAuditLog_eventId_createdAt_idx" ON "TicketAuditLog"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "TicketAuditLog_eventId_entityType_entityId_idx" ON "TicketAuditLog"("eventId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "TicketAuditLog_actorUserId_idx" ON "TicketAuditLog"("actorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketOutboxMessage_dedupeKey_key" ON "TicketOutboxMessage"("dedupeKey");

-- CreateIndex
CREATE INDEX "TicketOutboxMessage_status_availableAt_idx" ON "TicketOutboxMessage"("status", "availableAt");

-- CreateIndex
CREATE INDEX "TicketOutboxMessage_eventId_idx" ON "TicketOutboxMessage"("eventId");

-- CreateIndex
CREATE INDEX "TicketOutboxMessage_orderId_idx" ON "TicketOutboxMessage"("orderId");

-- AddForeignKey
ALTER TABLE "TicketEvent" ADD CONSTRAINT "TicketEvent_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "CalendarEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEvent" ADD CONSTRAINT "TicketEvent_ownerGroupId_fkey" FOREIGN KEY ("ownerGroupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEvent" ADD CONSTRAINT "TicketEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketInventoryPool" ADD CONSTRAINT "TicketInventoryPool_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TicketEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketType" ADD CONSTRAINT "TicketType_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TicketEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketType" ADD CONSTRAINT "TicketType_inventoryPoolId_eventId_fkey" FOREIGN KEY ("inventoryPoolId", "eventId") REFERENCES "TicketInventoryPool"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketQuestion" ADD CONSTRAINT "TicketQuestion_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TicketEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketQuestion" ADD CONSTRAINT "TicketQuestion_ticketTypeId_eventId_fkey" FOREIGN KEY ("ticketTypeId", "eventId") REFERENCES "TicketType"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEventUserGrant" ADD CONSTRAINT "TicketEventUserGrant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TicketEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEventUserGrant" ADD CONSTRAINT "TicketEventUserGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEventUserGrant" ADD CONSTRAINT "TicketEventUserGrant_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEventGroupGrant" ADD CONSTRAINT "TicketEventGroupGrant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TicketEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEventGroupGrant" ADD CONSTRAINT "TicketEventGroupGrant_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEventGroupGrant" ADD CONSTRAINT "TicketEventGroupGrant_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketOrder" ADD CONSTRAINT "TicketOrder_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TicketEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketOrder" ADD CONSTRAINT "TicketOrder_buyerUserId_fkey" FOREIGN KEY ("buyerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketOrderItem" ADD CONSTRAINT "TicketOrderItem_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TicketEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketOrderItem" ADD CONSTRAINT "TicketOrderItem_orderId_eventId_fkey" FOREIGN KEY ("orderId", "eventId") REFERENCES "TicketOrder"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketOrderItem" ADD CONSTRAINT "TicketOrderItem_ticketTypeId_eventId_fkey" FOREIGN KEY ("ticketTypeId", "eventId") REFERENCES "TicketType"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketOrderItem" ADD CONSTRAINT "TicketOrderItem_inventoryPoolId_eventId_fkey" FOREIGN KEY ("inventoryPoolId", "eventId") REFERENCES "TicketInventoryPool"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketOrderItemAnswer" ADD CONSTRAINT "TicketOrderItemAnswer_orderItemId_eventId_fkey" FOREIGN KEY ("orderItemId", "eventId") REFERENCES "TicketOrderItem"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketOrderItemAnswer" ADD CONSTRAINT "TicketOrderItemAnswer_questionId_eventId_fkey" FOREIGN KEY ("questionId", "eventId") REFERENCES "TicketQuestion"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketPayment" ADD CONSTRAINT "TicketPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TicketOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketPaymentWebhook" ADD CONSTRAINT "TicketPaymentWebhook_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "TicketPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TicketEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_orderItemId_eventId_fkey" FOREIGN KEY ("orderItemId", "eventId") REFERENCES "TicketOrderItem"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_checkedInById_fkey" FOREIGN KEY ("checkedInById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketRefund" ADD CONSTRAINT "TicketRefund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TicketOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketRefund" ADD CONSTRAINT "TicketRefund_paymentId_orderId_fkey" FOREIGN KEY ("paymentId", "orderId") REFERENCES "TicketPayment"("id", "orderId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketRefund" ADD CONSTRAINT "TicketRefund_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketRefundItem" ADD CONSTRAINT "TicketRefundItem_refundId_orderId_fkey" FOREIGN KEY ("refundId", "orderId") REFERENCES "TicketRefund"("id", "orderId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketRefundItem" ADD CONSTRAINT "TicketRefundItem_orderItemId_orderId_fkey" FOREIGN KEY ("orderItemId", "orderId") REFERENCES "TicketOrderItem"("id", "orderId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketGate" ADD CONSTRAINT "TicketGate_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TicketEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketScanDevice" ADD CONSTRAINT "TicketScanDevice_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TicketEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketScanDevice" ADD CONSTRAINT "TicketScanDevice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketScanLog" ADD CONSTRAINT "TicketScanLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TicketEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketScanLog" ADD CONSTRAINT "TicketScanLog_ticketId_eventId_fkey" FOREIGN KEY ("ticketId", "eventId") REFERENCES "Ticket"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketScanLog" ADD CONSTRAINT "TicketScanLog_scannerUserId_fkey" FOREIGN KEY ("scannerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketScanLog" ADD CONSTRAINT "TicketScanLog_deviceId_eventId_fkey" FOREIGN KEY ("deviceId", "eventId") REFERENCES "TicketScanDevice"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketScanLog" ADD CONSTRAINT "TicketScanLog_gateId_eventId_fkey" FOREIGN KEY ("gateId", "eventId") REFERENCES "TicketGate"("id", "eventId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketScanLog" ADD CONSTRAINT "TicketScanLog_reversesScanId_fkey" FOREIGN KEY ("reversesScanId") REFERENCES "TicketScanLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAuditLog" ADD CONSTRAINT "TicketAuditLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TicketEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAuditLog" ADD CONSTRAINT "TicketAuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketOutboxMessage" ADD CONSTRAINT "TicketOutboxMessage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TicketEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketOutboxMessage" ADD CONSTRAINT "TicketOutboxMessage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TicketOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Database-level ticketing invariants that Prisma cannot express.
ALTER TABLE "TicketEvent"
    ADD CONSTRAINT "TicketEvent_dates_check" CHECK ("endsAt" > "startsAt"),
    ADD CONSTRAINT "TicketEvent_sales_window_check" CHECK ("salesStartAt" IS NULL OR "salesEndAt" IS NULL OR "salesEndAt" > "salesStartAt"),
    ADD CONSTRAINT "TicketEvent_currency_check" CHECK (char_length("currency") = 3 AND "currency" = upper("currency")),
    ADD CONSTRAINT "TicketEvent_max_tickets_check" CHECK ("maxTicketsPerOrder" > 0);

-- All inventory mutations must use a conditional UPDATE inside the checkout
-- transaction. This constraint is the final guard against overselling.
ALTER TABLE "TicketInventoryPool"
    ADD CONSTRAINT "TicketInventoryPool_counts_check" CHECK (
        "capacity" >= 0
        AND "reservedCount" >= 0
        AND "soldCount" >= 0
        AND "reservedCount" + "soldCount" <= "capacity"
    ),
    ADD CONSTRAINT "TicketInventoryPool_version_check" CHECK ("version" >= 0);

ALTER TABLE "TicketType"
    ADD CONSTRAINT "TicketType_price_check" CHECK ("unitPriceCents" >= 0),
    ADD CONSTRAINT "TicketType_order_limits_check" CHECK ("minPerOrder" > 0 AND "maxPerOrder" >= "minPerOrder"),
    ADD CONSTRAINT "TicketType_sales_window_check" CHECK ("salesStartAt" IS NULL OR "salesEndAt" IS NULL OR "salesEndAt" > "salesStartAt"),
    ADD CONSTRAINT "TicketType_currency_check" CHECK (char_length("currency") = 3 AND "currency" = upper("currency"));

ALTER TABLE "TicketQuestion"
    ADD CONSTRAINT "TicketQuestion_options_check" CHECK (
        (
            "type" IN ('SINGLE_CHOICE', 'MULTIPLE_CHOICE')
            AND "options" IS NOT NULL
            AND jsonb_typeof("options") = 'array'
            AND jsonb_array_length("options") > 0
        )
        OR (
            "type" NOT IN ('SINGLE_CHOICE', 'MULTIPLE_CHOICE')
            AND "options" IS NULL
        )
    );

ALTER TABLE "TicketOrder"
    ADD CONSTRAINT "TicketOrder_amounts_check" CHECK (
        "subtotalCents" >= 0
        AND "discountCents" >= 0
        AND "discountCents" <= "subtotalCents"
        AND "totalCents" = "subtotalCents" - "discountCents"
        AND "refundedCents" >= 0
        AND "refundedCents" <= "totalCents"
    ),
    ADD CONSTRAINT "TicketOrder_currency_check" CHECK (char_length("currency") = 3 AND "currency" = upper("currency")),
    ADD CONSTRAINT "TicketOrder_pending_expiry_check" CHECK ("status" <> 'PENDING_PAYMENT' OR "reservationExpiresAt" IS NOT NULL),
    ADD CONSTRAINT "TicketOrder_paid_timestamp_check" CHECK (
        "status" NOT IN ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED') OR "paidAt" IS NOT NULL
    ),
    ADD CONSTRAINT "TicketOrder_access_expiry_check" CHECK ("accessExpiresAt" > "createdAt");

ALTER TABLE "TicketOrderItem"
    ADD CONSTRAINT "TicketOrderItem_amounts_check" CHECK (
        "unitPriceCents" >= 0
        AND "discountCents" >= 0
        AND "discountCents" <= "unitPriceCents"
        AND "totalCents" = "unitPriceCents" - "discountCents"
    );

ALTER TABLE "TicketPayment"
    ADD CONSTRAINT "TicketPayment_amount_check" CHECK ("amountCents" >= 0),
    ADD CONSTRAINT "TicketPayment_provider_check" CHECK (btrim("provider") <> '' AND btrim("idempotencyKey") <> ''),
    ADD CONSTRAINT "TicketPayment_currency_check" CHECK (char_length("currency") = 3 AND "currency" = upper("currency")),
    ADD CONSTRAINT "TicketPayment_succeeded_timestamp_check" CHECK ("status" <> 'SUCCEEDED' OR "succeededAt" IS NOT NULL),
    ADD CONSTRAINT "TicketPayment_failed_timestamp_check" CHECK ("status" <> 'FAILED' OR "failedAt" IS NOT NULL);

ALTER TABLE "TicketPaymentWebhook"
    ADD CONSTRAINT "TicketPaymentWebhook_identity_check" CHECK (btrim("provider") <> '' AND btrim("externalEventId") <> ''),
    ADD CONSTRAINT "TicketPaymentWebhook_attempts_check" CHECK ("processingAttempts" >= 0);

ALTER TABLE "Ticket"
    ADD CONSTRAINT "Ticket_credential_version_check" CHECK ("credentialVersion" > 0),
    ADD CONSTRAINT "Ticket_status_timestamp_check" CHECK (
        ("status" <> 'VOID' OR "voidedAt" IS NOT NULL)
        AND ("status" <> 'REFUNDED' OR "refundedAt" IS NOT NULL)
    );

ALTER TABLE "TicketRefund"
    ADD CONSTRAINT "TicketRefund_amount_check" CHECK ("amountCents" >= 0),
    ADD CONSTRAINT "TicketRefund_provider_check" CHECK (btrim("provider") <> '' AND btrim("idempotencyKey") <> ''),
    ADD CONSTRAINT "TicketRefund_currency_check" CHECK (char_length("currency") = 3 AND "currency" = upper("currency")),
    ADD CONSTRAINT "TicketRefund_completed_timestamp_check" CHECK ("status" <> 'SUCCEEDED' OR "completedAt" IS NOT NULL);

ALTER TABLE "TicketRefundItem"
    ADD CONSTRAINT "TicketRefundItem_amount_check" CHECK ("amountCents" >= 0);

ALTER TABLE "TicketScanLog"
    ADD CONSTRAINT "TicketScanLog_reversal_check" CHECK (
        ("result" = 'REVERSED') = ("reversesScanId" IS NOT NULL)
        AND ("reversesScanId" IS NULL OR "reversesScanId" <> "id")
    );

ALTER TABLE "TicketOutboxMessage"
    ADD CONSTRAINT "TicketOutboxMessage_attempts_check" CHECK ("attempts" >= 0),
    ADD CONSTRAINT "TicketOutboxMessage_sent_timestamp_check" CHECK ("status" <> 'SENT' OR "sentAt" IS NOT NULL);

-- Hot-path indexes for expiry, webhook processing and durable outbox claims.
CREATE INDEX "TicketOrder_pending_expiry_idx"
    ON "TicketOrder" ("reservationExpiresAt")
    WHERE "status" = 'PENDING_PAYMENT' AND "reservationExpiresAt" IS NOT NULL;

CREATE INDEX "TicketPaymentWebhook_unprocessed_idx"
    ON "TicketPaymentWebhook" ("receivedAt")
    WHERE "processedAt" IS NULL;

CREATE INDEX "TicketOutboxMessage_claim_idx"
    ON "TicketOutboxMessage" ("availableAt", "createdAt")
    WHERE "status" IN ('PENDING', 'FAILED');

-- Scan and audit records are append-only. The narrowly allowed UPDATE paths
-- only support ON DELETE SET NULL for references to erased users/devices/gates.
CREATE FUNCTION "ticket_scan_log_prevent_mutation"()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE'
       AND (to_jsonb(NEW) - ARRAY['scannerUserId', 'deviceId', 'gateId'])
           IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['scannerUserId', 'deviceId', 'gateId'])
       AND (NEW."scannerUserId" IS NOT DISTINCT FROM OLD."scannerUserId" OR NEW."scannerUserId" IS NULL)
       AND (NEW."deviceId" IS NOT DISTINCT FROM OLD."deviceId" OR NEW."deviceId" IS NULL)
       AND (NEW."gateId" IS NOT DISTINCT FROM OLD."gateId" OR NEW."gateId" IS NULL) THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'TicketScanLog is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TicketScanLog_append_only"
BEFORE UPDATE OR DELETE ON "TicketScanLog"
FOR EACH ROW EXECUTE FUNCTION "ticket_scan_log_prevent_mutation"();

CREATE FUNCTION "ticket_audit_log_prevent_mutation"()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE'
       AND (to_jsonb(NEW) - 'actorUserId') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'actorUserId')
       AND (NEW."actorUserId" IS NOT DISTINCT FROM OLD."actorUserId" OR NEW."actorUserId" IS NULL) THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'TicketAuditLog is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TicketAuditLog_append_only"
BEFORE UPDATE OR DELETE ON "TicketAuditLog"
FOR EACH ROW EXECUTE FUNCTION "ticket_audit_log_prevent_mutation"();
