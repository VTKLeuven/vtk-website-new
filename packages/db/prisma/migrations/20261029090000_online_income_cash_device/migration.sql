-- Oriëntatie online inkomsten, fase 2: een kanaal kan een toestel van de
-- kassa's zijn (een Bancontact-bakje of een Payconiq-rekening), zodat een kassa
-- het ingetikte bedrag naast wat de import zag kan tonen. Bestaande kanalen zijn
-- niet gekoppeld (NULL): welk kanaal welk toestel is, vult Beheer zelf in.

-- AlterTable
ALTER TABLE "IncomeChannel" ADD COLUMN     "cashMethod" "CashRegisterPaymentMethod",
ADD COLUMN     "cashTerminal" TEXT;
