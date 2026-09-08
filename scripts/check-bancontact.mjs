/**
 * Kijkt na of BANCONTACT_API_KEY aanvaard wordt, en op welke host.
 *
 * Dit bestaat omdat het antwoord op de verkeerde host niets verraadt. De oude
 * payconiq-host leeft nog en antwoordt `401 UNAUTHORIZED` met exact dezelfde
 * body als wanneer je helemaal geen sleutel meestuurt, en de koper ziet enkel
 * "de betaalpagina is tijdelijk niet bereikbaar". Een geldige sleutel op het
 * verkeerde adres ziet er dus uit als een ongeldige sleutel. Dat heeft hier een
 * avond gekost; dit script legt de kandidaten naast elkaar.
 *
 *   node --env-file=.env scripts/check-bancontact.mjs
 *
 * Er wordt niets aangemaakt: het script vraagt een betaling op die niet bestaat.
 * Wat je wil zien is 404 op één van de hosts, want dat betekent dat de sleutel
 * herkend is en enkel die ene betaling niet bestaat. Blijft het overal 401, dan
 * draagt de sleutel de authority MERCHANT_PAYMENT niet.
 */

const HOSTS = {
  productie: "https://merchant.api.bancontact.net",
  preprod: "https://merchant.api.preprod.bancontact.net",
  "payconiq (oud, hoort niet meer te werken)": "https://api.payconiq.com",
};

const key = process.env.BANCONTACT_API_KEY?.trim();
if (!key) {
  console.error("BANCONTACT_API_KEY staat niet in de omgeving.");
  console.error("Draai dit als: node --env-file=.env scripts/check-bancontact.mjs");
  process.exit(1);
}

const configured = process.env.BANCONTACT_API_BASE?.trim() || HOSTS.productie;
console.log(`Sleutel: ${key.slice(0, 4)}... (${key.length} tekens)`);
console.log(`BANCONTACT_API_BASE: ${process.env.BANCONTACT_API_BASE?.trim() || "(leeg, dus productie)"}\n`);

/** Eén opvraging, met en zonder sleutel, zodat het verschil zichtbaar is. */
async function probe(base, withKey) {
  try {
    const response = await fetch(`${base}/v3/payments/000000000000000000000000`, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        ...(withKey ? { Authorization: `Bearer ${key}` } : {}),
      },
      signal: AbortSignal.timeout(20_000),
    });
    return { status: response.status, body: (await response.text()).slice(0, 200) };
  } catch (error) {
    return { status: 0, body: String(error) };
  }
}

let accepted = null;
for (const [name, base] of Object.entries(HOSTS)) {
  const [withKey, withoutKey] = await Promise.all([probe(base, true), probe(base, false)]);
  const recognised = withKey.status !== 401 && withKey.status !== 0;
  if (recognised && !accepted) accepted = { name, base };

  console.log(`${name} (${base})`);
  console.log(`  met sleutel    -> HTTP ${withKey.status} ${withKey.body}`);
  console.log(`  zonder sleutel -> HTTP ${withoutKey.status} ${withoutKey.body}`);
  console.log(
    `  ${recognised ? "SLEUTEL AANVAARD op deze host" : "sleutel niet aanvaard (zelfde antwoord als zonder sleutel)"}\n`
  );
}

if (!accepted) {
  console.log("Geen enkele host herkent deze sleutel.");
  console.log("Haal in de Bancontact Pro-portal de API-sleutel van het betaalprofiel op:");
  console.log("die moet de authority MERCHANT_PAYMENT dragen voor dit PAYMENTPROFILE.");
  process.exit(1);
}

console.log(`Deze sleutel hoort bij: ${accepted.name} (${accepted.base}).`);
if (accepted.base !== configured) {
  console.log(`Maar de configuratie wijst naar ${configured}.`);
  console.log(
    accepted.base === HOSTS.productie
      ? "Laat BANCONTACT_API_BASE leeg."
      : `Zet BANCONTACT_API_BASE="${accepted.base}".`
  );
  process.exit(1);
}
console.log("De configuratie wijst naar dezelfde host. Betalen zou moeten werken.");
