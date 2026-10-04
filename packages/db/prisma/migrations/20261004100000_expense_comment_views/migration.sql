-- Een vrije opmerking bij een rekening. Activiteit en omschrijving worden kort
-- (standaard max. drie woorden, want ze staan in de bestandsnaam); wat er meer
-- te zeggen valt, komt hier. Bestaande rekeningen krijgen NULL: daar is nooit
-- een opmerking gevraagd, en hun omschrijving blijft zoals ze was.
ALTER TABLE "Expense" ADD COLUMN "comment" TEXT;

-- Welke rekeningen een gebruiker al opende in het overzicht. Geen backfill: de
-- rekeningen van voor deze migratie gelden als gezien via
-- `EXPENSE_VIEWS_SINCE` in apps/web/lib/rekeningen/expenses.ts, anders stond
-- de hele historiek gearceerd.
CREATE TABLE "ExpenseView" (
    "userId" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "viewedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseView_pkey" PRIMARY KEY ("userId","expenseId")
);

CREATE INDEX "ExpenseView_expenseId_idx" ON "ExpenseView"("expenseId");

ALTER TABLE "ExpenseView" ADD CONSTRAINT "ExpenseView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExpenseView" ADD CONSTRAINT "ExpenseView_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
