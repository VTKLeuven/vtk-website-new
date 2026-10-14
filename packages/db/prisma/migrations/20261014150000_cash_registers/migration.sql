-- Kassa's: een post vraagt een kassa aan, Beheer aanvaardt, maakt, geeft mee
-- en telt na. Vervangt het rekenblad "Overzichtdocument Kassa's". Nieuwe
-- tabellen, dus er zijn geen bestaande rijen die een waarde moeten krijgen.

-- CreateEnum
CREATE TYPE "CashRegisterStatus" AS ENUM ('REQUESTED', 'TO_MAKE', 'MADE', 'HANDED_OUT', 'RETURNED', 'COUNTED', 'PASSED_ON', 'BOOKED');

-- CreateEnum
CREATE TYPE "CashRegisterPaymentMethod" AS ENUM ('BANCONTACT', 'PAYCONIQ');

-- CreateTable
CREATE TABLE "CashRegister" (
    "id" TEXT NOT NULL,
    "status" "CashRegisterStatus" NOT NULL DEFAULT 'REQUESTED',
    "workingYear" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "activity" TEXT NOT NULL,
    "groupId" TEXT,
    "postLabel" TEXT NOT NULL,
    "responsibleName" TEXT NOT NULL,
    "requestedById" TEXT,
    "wantsBancontact" BOOLEAN NOT NULL DEFAULT false,
    "wantsPayconiq" BOOLEAN NOT NULL DEFAULT false,
    "comment" TEXT,
    "startCounts" JSONB NOT NULL,
    "endCounts" JSONB,
    "shiftVouchers" INTEGER,
    "elixirVouchers" INTEGER,
    "shiftVoucherValueCents" INTEGER NOT NULL,
    "elixirVoucherValueCents" INTEGER NOT NULL,
    "note" TEXT,
    "acceptedAt" TIMESTAMPTZ(3),
    "acceptedById" TEXT,
    "acceptedMailSentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CashRegister_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashRegisterPayment" (
    "id" TEXT NOT NULL,
    "registerId" TEXT NOT NULL,
    "method" "CashRegisterPaymentMethod" NOT NULL,
    "terminal" TEXT NOT NULL,
    "amountCents" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CashRegisterPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashRegisterTicketEvent" (
    "registerId" TEXT NOT NULL,
    "ticketEventId" TEXT NOT NULL,

    CONSTRAINT "CashRegisterTicketEvent_pkey" PRIMARY KEY ("registerId","ticketEventId")
);

-- CreateIndex
CREATE INDEX "CashRegister_workingYear_idx" ON "CashRegister"("workingYear");

-- CreateIndex
CREATE INDEX "CashRegister_groupId_idx" ON "CashRegister"("groupId");

-- CreateIndex
CREATE INDEX "CashRegister_requestedById_idx" ON "CashRegister"("requestedById");

-- CreateIndex
CREATE INDEX "CashRegister_date_idx" ON "CashRegister"("date");

-- CreateIndex
CREATE INDEX "CashRegister_status_idx" ON "CashRegister"("status");

-- CreateIndex
CREATE INDEX "CashRegisterPayment_registerId_idx" ON "CashRegisterPayment"("registerId");

-- CreateIndex
CREATE INDEX "CashRegisterTicketEvent_ticketEventId_idx" ON "CashRegisterTicketEvent"("ticketEventId");

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegisterPayment" ADD CONSTRAINT "CashRegisterPayment_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "CashRegister"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegisterTicketEvent" ADD CONSTRAINT "CashRegisterTicketEvent_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "CashRegister"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashRegisterTicketEvent" ADD CONSTRAINT "CashRegisterTicketEvent_ticketEventId_fkey" FOREIGN KEY ("ticketEventId") REFERENCES "TicketEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- De permissies zelf, want de seed draait niet mee met een deploy: zonder deze
-- rijen zijn ze ook niet toe te kennen in /admin/roles. Zelfde aanpak als
-- 20260901213000_hero_week_permission.
INSERT INTO "Permission" ("id", "code", "labelNl", "labelEn", "category")
VALUES
  (
    'permission-cash-registers-request',
    'cashRegisters.request',
    'Een kassa aanvragen',
    'Request a cash register',
    'cashRegisters'
  ),
  (
    'permission-cash-registers-manage',
    'cashRegisters.manage',
    'Kassa''s beheren (aanvaarden, status zetten, tellen)',
    'Manage cash registers (accept, set status, count)',
    'cashRegisters'
  )
ON CONFLICT ("code") DO UPDATE
SET
  "labelNl" = EXCLUDED."labelNl",
  "labelEn" = EXCLUDED."labelEn",
  "category" = EXCLUDED."category";

-- Aanvragen hoort bij de basisrol van elk praesidiumlid (zoals een rekening
-- indienen); beheren bij admin, dus bij IT en Groep 5. Zelfde verdeling als in
-- de seed.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" AS role
CROSS JOIN "Permission" AS permission
WHERE (role."code" = 'praesidium' AND permission."code" = 'cashRegisters.request')
   OR (role."code" = 'admin' AND permission."code" IN ('cashRegisters.request', 'cashRegisters.manage'))
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
