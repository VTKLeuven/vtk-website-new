import { describe, expect, it } from "vitest";

import { almaStatus } from "@/lib/alma";
import { parseAlmaPage, parseHours, parseMenu, parseMenuDates } from "@/lib/alma/parse";

/**
 * De lezer van alma.be. De opmaak hieronder is ingekort maar letterlijk
 * overgenomen van https://www.alma.be/nl/restaurants/alma-3 (november 2026).
 * Faalt deze test na een wijziging bij Alma, vergelijk dan eerst met hun pagina.
 */

const card = (id: string, name: string, priceHtml: string, labels: string) => `
<div id="${id}"  class="relative block px-4 py-6 bg-white cursor-pointer rounded-card menucard js-menu">
    <div class="flex flex-col items-center justify-center h-full pointer-events-none">
            <div class="">
                <picture>
                <img src="data:image/svg+xml,%3Csvg%3E"
                    srcset="https://www.alma.be/files/_820x615_crop_center-center_82_line/${id}.png 820w, /files/_375x281_crop_center-center_60_line/${id}.png 375w"
                    alt="${id} foto" class="w-48" loading="lazy"/>
            </picture>
        </div>
            <h4 class="px-4 mt-4 leading-tight text-center">${name}</h4>
                    <div class="flex items-center gap-2">${priceHtml}</div>
            </div>
<div class="absolute flex flex-col items-center -top-2 -right-2">
            <div class="space-y-2">${labels}</div>
</div>
</div>
<div class="hidden" id="menuContent-${id}"><div id="menuModal-${id}" class="sprig-component"></div></div>`;

const price = (type: string, euro: string, cents: string) => `
<div class="bg-priceblue px-2 rounded-lg font-semibold shrink-0 js-price" data-type="${type}">
    <div class="mt-1">
        <span class="text-lg text-primary-hover">&euro;${euro}<span>
        <span class="text-xs font-semibold menuprice text-primary-hover">.${cents}</span>
    </div>
</div>`;

const label = (alt: string) => `<img class="block h-10 mb-1 ml-2" src="https://www.alma.be/files/x.png" alt="${alt}"/>`;

const PAGE = `
<input class="js-menu-date-picker" data-dates="[&quot;2026-11-25&quot;,&quot;2026-11-24&quot;,&quot;2026-11-26&quot;]" />
<div class="py-6">
  <div id="13800" class="mt-8 font-normal lg:mt-10 text-custom-title text-primary-hover scroll-m-44 md:scroll-m-28">
      <div>
          Warm buffet
          (3)
      </div>
  </div>
  <div class="py-4 md:py-6">
      <div class="text-lg font-normal text-primary-hover">Maaltijd I</div>
  </div>
  <div class="grid">
${card("314534", "Burrito met nacho&#039;s en salsa", price("kul", "6", "15") + price("notKul", "10", "65") + price("other", "15", "85"), label("Vegan"))}
${card("314535", "Kip met Franse erwtjes", price("kul", "6", "15") + price("notKul", "10", "65") + price("other", "15", "85"), label("Gevogelte") + label("Heel laag"))}
  </div>
  <div class="py-4 md:py-6">
      <div class="text-lg font-normal text-primary-hover">Optioneel</div>
  </div>
${card("314536", "Geraspte kaas, gratis bij spaghetti", '<div class="text-lg font-semibold font-base">Gratis</div>', label("Vegetarisch (niet-vegan)") + label("Gemiddeld"))}
  <div id="1848" class="mt-8 font-normal lg:mt-10 text-custom-title text-primary-hover scroll-m-44 md:scroll-m-28">
      <div>
          Soep
          (1)
      </div>
  </div>
${card("314600", "Romige tomatensoep (G)", price("kul", "3", "00"), label("Vegan"))}
</div>
<div class="not-italic font-normal text-primary-hover">
    <div>
    Steengroevenlaan 3
    </div>
    <div class="mt-1">
    3001
    Heverlee
    </div>
</div>
<a href="https://www.google.com/maps/dir/?api=1&destination=50.867717800, 4.685290400">Routebeschrijving</a>
<h4 class="font-medium text-custom-title font-accent text-primary-hover">Openingsdagen en openingsuren</h4>
<div class="text-primary-hover mb-8 flex flex-col space-y-6">
    <div class="grow">
    <span><strong class="uppercase text-sm tracking-wider font-semibold">Warme maaltijden</strong></span>
    <dl class="mt-2 flex flex-col space-y-2">
        <div class="flex flex-row">
            <dt class="w-1/4 inline-block">Di 24/11</dt>
            <dd class="w-3/4">
                <strong class="font-semibold">11:30–14:00</strong> en <strong class="font-semibold">17:30–19:30</strong>
            </dd>
        </div>
        <div class="flex flex-row">
            <dt class="w-1/4 inline-block">Za 28/11</dt>
            <dd class="w-3/4">
                <strong class="font-semibold">gesloten</strong>
            </dd>
        </div>
    </dl>
    </div>
    <div class="grow">
    <span><strong class="uppercase text-sm tracking-wider font-semibold">Snacks &amp; sandwiches</strong></span>
    <dl class="mt-2 flex flex-col space-y-2">
        <div class="flex flex-row">
            <dt class="w-1/4 inline-block">Di 24/11</dt>
            <dd class="w-3/4"><strong class="font-semibold">10:00–14:00</strong></dd>
        </div>
        <div class="flex flex-row">
            <dt class="w-1/4 inline-block">Ma 30/11</dt>
            <dd class="w-3/4"><strong class="font-semibold">10:00–14:00</strong></dd>
        </div>
    </dl>
    </div>
</div>`;

describe("parseMenuDates", () => {
  it("neemt de getoonde dag uit de eerste plaats en sorteert de rest", () => {
    expect(parseMenuDates(PAGE)).toEqual({ shown: "2026-11-25", dates: ["2026-11-24", "2026-11-25", "2026-11-26"] });
  });

  it("geeft niets zonder datumkiezer", () => {
    expect(parseMenuDates("<html></html>")).toEqual({ shown: null, dates: [] });
  });
});

describe("parseMenu", () => {
  const menu = parseMenu(PAGE);

  it("volgt secties en groepen in de volgorde van de pagina", () => {
    expect(menu.map((section) => section.title)).toEqual(["Warm buffet", "Soep"]);
    expect(menu[0].groups.map((group) => group.title)).toEqual(["Maaltijd I", "Optioneel"]);
    expect(menu[1].groups).toHaveLength(1);
    expect(menu[1].groups[0].title).toBeNull();
  });

  it("leest naam, prijzen in eurocent, labels en de afbeelding van 375 pixels", () => {
    const [burrito, kip] = menu[0].groups[0].dishes;
    expect(burrito).toEqual({
      id: "314534",
      name: "Burrito met nacho's en salsa",
      prices: { kuleuven: 615, student: 1065, other: 1585 },
      diet: "vegan",
      protein: null,
      climate: null,
      imageUrl: "https://www.alma.be/files/_375x281_crop_center-center_60_line/314534.png",
    });
    expect(kip.protein).toBe("Gevogelte");
    expect(kip.climate).toBe("very-low");
    expect(kip.diet).toBeNull();
  });

  it("zet gratis op 0 en een ontbrekende prijs op null", () => {
    expect(menu[0].groups[1].dishes[0].prices).toEqual({ kuleuven: 0, student: 0, other: 0 });
    expect(menu[0].groups[1].dishes[0].diet).toBe("vegetarian");
    expect(menu[1].groups[0].dishes[0].prices).toEqual({ kuleuven: 300, student: null, other: null });
  });
});

describe("parseHours", () => {
  it("leest per soort de dagen, met twee vensters en gesloten dagen", () => {
    expect(parseHours(PAGE, "2026-11-24")).toEqual([
      {
        kind: "Warme maaltijden",
        days: [
          { date: "2026-11-24", windows: [{ start: 690, end: 840 }, { start: 1050, end: 1170 }] },
          { date: "2026-11-28", windows: [] },
        ],
      },
      {
        kind: "Snacks & sandwiches",
        days: [
          { date: "2026-11-24", windows: [{ start: 600, end: 840 }] },
          { date: "2026-11-30", windows: [{ start: 600, end: 840 }] },
        ],
      },
    ]);
  });

  it("legt een dag rond nieuwjaar in het juiste jaar", () => {
    const html = PAGE.replace("Ma 30/11", "Ma 4/1");
    const days = parseHours(html, "2026-12-29")[1].days.map((day) => day.date);
    expect(days).toEqual(["2026-11-24", "2027-01-04"]);
  });
});

describe("parseAlmaPage", () => {
  it("leest het adres en de plaats", () => {
    const page = parseAlmaPage(PAGE, "2026-11-24");
    expect(page.address).toBe("Steengroevenlaan 3, 3001 Heverlee");
    expect(page.location).toEqual({ lat: 50.8677178, lng: 4.6852904 });
    expect(page.menuDate).toBe("2026-11-25");
  });

  it("geeft geen menudag wanneer er geen menu is", () => {
    const page = parseAlmaPage('<input data-dates="[&quot;2026-11-25&quot;]" />', "2026-11-24");
    expect(page.menuDate).toBeNull();
    expect(page.menu).toEqual([]);
  });
});

describe("almaStatus", () => {
  const hours = parseHours(PAGE, "2026-11-24");
  // 24 november is wintertijd: Brussel is UTC+1.
  const at = (iso: string) => new Date(iso);

  it("is open tijdens een venster, over de soorten heen samengevoegd", () => {
    expect(almaStatus(hours, at("2026-11-24T09:30:00Z"), "nl")).toMatchObject({ openNow: true, detail: "tot 14:00" });
    expect(almaStatus(hours, at("2026-11-24T09:30:00Z"), "nl").today).toEqual([
      { start: 600, end: 840 },
      { start: 1050, end: 1170 },
    ]);
  });

  it("zegt wanneer het vandaag nog opengaat", () => {
    expect(almaStatus(hours, at("2026-11-24T14:00:00Z"), "nl")).toMatchObject({ openNow: false, detail: "opent 17:30" });
    expect(almaStatus(hours, at("2026-11-24T14:00:00Z"), "en").detail).toBe("opens 17:30");
  });

  it("noemt de volgende dag met uren", () => {
    expect(almaStatus(hours, at("2026-11-24T20:00:00Z"), "nl").detail).toBe("ma 10:00");
  });

  it("is gesloten zonder uren", () => {
    expect(almaStatus([], at("2026-11-24T09:30:00Z"), "nl")).toEqual({ openNow: false, detail: "gesloten", today: [] });
  });
});
