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
