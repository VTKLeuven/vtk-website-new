/**
 * Adressen die een redacteur intikt, zijn twee dingen tegelijk: een pad op deze
 * site (`/shift`, `/piano`) of een volledige URL naar ergens anders
 * (`https://cudi.vtk.be`). Het verschil bepaalt of er een taalvoorvoegsel voor
 * moet en of de link in een nieuw tabblad opent.
 */

/**
 * Alles met een schema (`https:`, `mailto:`) of een protocol-relatief adres
 * (`//host`) wijst buiten deze site. Een pad als `/piano` niet.
 */
export function isExternalUrl(url: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//");
}

/**
 * Zet het taalvoorvoegsel voor een intern pad. Een extern adres blijft zoals het
 * is: daar heeft ons voorvoegsel niets te zoeken.
 *
 * `base` is "" voor Nederlands en "/en" voor Engels, net als elders in de app.
 * Zonder deze stap houdt een knop op een Engelse pagina de bezoeker niet in het
 * Engels: `/shift` bestaat namelijk ook, en werkt, maar dan in het Nederlands.
 */
export function withLocaleBase(url: string, base: string): string {
  if (isExternalUrl(url)) return url;
  return base === "" ? url : `${base}${url}`;
}

/**
 * Mag dit adres in een veld dat een redacteur invult? Twee vormen zijn geldig:
 * een pad op deze site (`/praesidium`, `/kalender`) en een volledig http(s)-adres
 * naar ergens anders. `extraProtocols` laat een scherm er iets bij toestaan; de
 * linkpagina aanvaardt ook `mailto:` en `tel:`, de rest niet.
 *
 * Dit bestond lang niet, en dan schrijft elk scherm zijn eigen regel. Het gevolg
 * was dat `Page.ctaUrl` en de linkpagina een pad aanvaardden, terwijl de
 * menu-items en de aankondigingsknop `https://` eisten; die laatste twee renderen
 * een intern pad wél correct, je kon het alleen niet opslaan.
 *
 * Geweigerd: een protocol-relatief adres (`//host`) en `/\host`, want die zien
 * eruit als een pad maar wijzen weg, en alles met een ander schema
 * (`javascript:`) omdat dat niet in een redactievak thuishoort.
 */
export function isEditableDestination(url: string, extraProtocols: string[] = []): boolean {
  if (isSameSitePath(url)) return true;
  try {
    const protocol = new URL(url).protocol;
    return ["http:", "https:", ...extraProtocols].includes(protocol);
  } catch {
    return false;
  }
}

/** Een pad op deze site: begint met één `/`, zonder host erachter verstopt. */
export function isSameSitePath(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\");
}
