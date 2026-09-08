/**
 * Kijkt na of BANCONTACT_API_KEY aanvaard wordt, en op welke host.
 *
 * Dit bestaat omdat het antwoord op een verkeerde sleutel niets verraadt: de
 * provider stuurt `401 UNAUTHORIZED` met exact dezelfde body als wanneer je
 * helemaal geen sleutel meestuurt, en de koper ziet enkel "de betaalpagina is
 * tijdelijk niet bereikbaar". Dat verschil zelf uitvlooien kost een avond; dit
 * script legt de twee naast elkaar.
 *
 *   node --env-file=.env scripts/check-bancontact.mjs
 *
 * Er wordt niets aangemaakt: het script vraagt een betaling op die niet bestaat.
 * Wat je wil zien is 404 (of 400) op één van de twee hosts, want dat betekent
 * dat de sleutel herkend is en enkel die betaling niet bestaat. Blijft het op
 * allebei 401, dan is de sleutel geen betaalsleutel van dit product.
 */

const HOSTS = {
  productie: "https://api.payconiq.com",
  sandbox: "https://api.ext.payconiq.com",
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
  console.log("Geen van beide hosts herkent deze sleutel.");
  console.log("Haal in de Bancontact Pro-portal de API-sleutel van het online/e-commerce");
  console.log("product op (elk product heeft een eigen sleutel) en kijk na of ze geactiveerd is.");
  process.exit(1);
}

console.log(`Deze sleutel hoort bij: ${accepted.name} (${accepted.base}).`);
if (accepted.base !== configured) {
  console.log(`Maar de configuratie wijst naar ${configured}.`);
  console.log(
    accepted.name === "sandbox"
      ? 'Zet BANCONTACT_API_BASE="https://api.ext.payconiq.com".'
      : "Laat BANCONTACT_API_BASE leeg."
  );
  process.exit(1);
}
console.log("De configuratie wijst naar dezelfde host. Betalen zou moeten werken.");
