import { describe, expect, it } from 'vitest';
import { HEADER_TABS } from '@vtk/db/groups';

// Rechtstreeks uit de seed-defaults, niet uit de database: dit test wat een
// verse installatie krijgt en wat de fallback in `lib/headerTabs.ts` toont zolang
// de HeaderTab-tabel leeg is. De bestaande databases worden door de migraties
// bijgetrokken; die zijn hier niet te unittesten.

const infoTab = HEADER_TABS.find((tab) => tab.code === 'AANBOD');
const allLinks = HEADER_TABS.flatMap((tab) => (tab.links ?? []).map((link) => ({ tab, link })));

describe('HEADER_TABS', () => {
  it('houdt de Info-tab op de slug /info', () => {
    // De tab heet sinds de hernoeming "Info"; enkel de code bleef AANBOD, want
    // daar hangen de Page-rijen aan vast.
    expect(infoTab).toBeDefined();
    expect(infoTab?.slug).toBe('info');
  });

  it('linkt de uitleendienst vanuit de Info-tab', () => {
    // apps/logistiek is een volledige app op een eigen host. Zonder dit item is
    // ze vanaf de hoofdsite nergens te bereiken.
    const rental = (infoTab?.links ?? []).find((link) => link.url.includes('logistiek.vtk.be'));
    expect(rental).toBeDefined();
    expect(rental?.url).toBe('https://logistiek.vtk.be');
    expect(rental?.labelNl).toBe('Uitleendienst');
    expect(rental?.labelEn).not.toBe('');
  });

  it('heeft geen enkel menu-item met een leeg pad', () => {
    // Een leeg of enkel-slash pad rendert als een link die naar de homepage
    // springt: zichtbaar in het menu, nutteloos bij het klikken.
    for (const { tab, link } of allLinks) {
      expect(link.url.trim(), `${tab.code}: lege url`).not.toBe('');
      expect(link.url.trim(), `${tab.code}: url wijst nergens heen`).not.toBe('/');
      expect(link.labelNl.trim(), `${tab.code}: leeg NL-label`).not.toBe('');
      expect(link.labelEn.trim(), `${tab.code}: leeg EN-label`).not.toBe('');
    }
  });

  it('geeft elke tab een slug en een label, en elke externe bestemming een URL', () => {
    const slugs = new Set<string>();
    for (const tab of HEADER_TABS) {
      expect(tab.slug.trim(), `${tab.code}: lege slug`).not.toBe('');
      expect(tab.labelNl.trim(), `${tab.code}: leeg NL-label`).not.toBe('');
      expect(tab.labelEn.trim(), `${tab.code}: leeg EN-label`).not.toBe('');
      expect(slugs.has(tab.slug), `${tab.code}: dubbele slug ${tab.slug}`).toBe(false);
      slugs.add(tab.slug);

      if (tab.externalUrl !== undefined) {
        expect(tab.externalUrl, `${tab.code}: lege externalUrl`).toMatch(/^https?:\/\/\S+/);
      }
      // Een knoplabel zonder bestemming (of omgekeerd) rendert niets: de
      // categoriepagina toont de CTA enkel wanneer beide gevuld zijn.
      expect(Boolean(tab.ctaLabelNl), `${tab.code}: CTA-label zonder URL`).toBe(
        Boolean(tab.ctaUrl),
      );
    }
  });

  it('gebruikt interne paden zonder taalvoorvoegsel', () => {
    // De header plakt zelf "/en" voor een intern pad. Staat het er al in, dan
    // wordt dat "/en/en/...".
    for (const { tab, link } of allLinks) {
      if (link.url.startsWith('/')) {
        expect(link.url, `${tab.code}: ${link.url}`).not.toMatch(/^\/(nl|en)(\/|$)/);
      }
    }
  });
});
