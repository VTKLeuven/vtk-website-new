/**
 * Gedeelde bits van de tijdelijke testschakelaar voor de eventkaart in de
 * hero (branch `test/hero-massief-paneel`). Staat los van de component omdat
 * `HomeEditorial` een server component is: een waarde importeren uit een
 * "use client"-module levert daar een clientreferentie op, geen string.
 *
 * Hoort niet op main; zie components/site/HeroPanelSwitch.tsx.
 */

export const HERO_PANEL_STORAGE_KEY = "vtk.heroPanel";

export type HeroPanelVariant = "glas" | "rail" | "massief";

export const HERO_PANEL_VARIANTS: Array<{
  id: HeroPanelVariant;
  label: string;
  hint: string;
}> = [
  { id: "glas", label: "Nu", hint: "Donker glas op 46%, zoals de site vandaag" },
  { id: "rail", label: "Massief + rail", hint: "Voorstel C met de gele accentrail" },
  { id: "massief", label: "Massief", hint: "Voorstel C zonder de gele rail" },
];

export const isHeroPanelVariant = (value: string | null | undefined): value is HeroPanelVariant =>
  value === "glas" || value === "rail" || value === "massief";

/**
 * Zet de keuze voor de eerste verf, zodat je bij een herlaadbeurt geen glas
 * ziet omslaan naar navy. Draait tijdens het parsen, dus voor React
 * hydrateert; de component leest daarna hetzelfde attribuut terug.
 *
 * `?hero=rail` in de URL wint van de opgeslagen keuze en vervangt ze, zodat
 * je een link kan doorsturen die meteen de juiste versie toont.
 */
export const heroPanelBootScript = `(function(){try{var k=${JSON.stringify(
  HERO_PANEL_STORAGE_KEY,
)};var q=new URL(location.href).searchParams.get("hero");var v=q||localStorage.getItem(k);if(v==="glas"||v==="rail"||v==="massief"){document.documentElement.dataset.heroPanel=v;if(q)localStorage.setItem(k,v);}}catch(e){}})();`;
