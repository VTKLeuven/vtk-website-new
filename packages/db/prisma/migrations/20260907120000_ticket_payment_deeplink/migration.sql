-- Bancontact levert geen gehoste checkoutpagina maar een deeplink naar de app
-- plus een QR. `checkoutUrl` blijft wat de koper te zien krijgt (onze eigen
-- pagina); deze twee kolommen dragen wat die pagina moet tonen.
ALTER TABLE "TicketPayment" ADD COLUMN "providerDeeplink" TEXT;
ALTER TABLE "TicketPayment" ADD COLUMN "providerQrCodeUrl" TEXT;
