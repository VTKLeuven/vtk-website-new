import { describe, expect, it } from 'vitest';
import { isEditableDestination, isExternalUrl, isSameSitePath, withLocaleBase } from '@/lib/href';

describe('isExternalUrl', () => {
  it('herkent een pad op deze site', () => {
    expect(isExternalUrl('/shift')).toBe(false);
    expect(isExternalUrl('/info/uitleendienst')).toBe(false);
  });

  it('herkent een adres buiten deze site', () => {
    expect(isExternalUrl('https://logistiek.dev.vtk.be')).toBe(true);
    expect(isExternalUrl('mailto:logistiek@vtk.be')).toBe(true);
    // Protocol-relatief: erft het schema van de pagina, maar wijst wel weg.
    expect(isExternalUrl('//cudi.vtk.be')).toBe(true);
  });
});

describe('withLocaleBase', () => {
  it('houdt een interne knop in dezelfde taal', () => {
    // De knop op /en/info/shiften moet naar /en/shift, niet naar /shift. Dat
    // laatste bestaat namelijk ook en werkt, maar zet de bezoeker terug in het
    // Nederlands zonder dat iets misgaat waar je het aan ziet.
    expect(withLocaleBase('/shift', '/en')).toBe('/en/shift');
    expect(withLocaleBase('/shift', '')).toBe('/shift');
  });

  it('laat een extern adres met rust', () => {
    expect(withLocaleBase('https://logistiek.dev.vtk.be', '/en')).toBe(
      'https://logistiek.dev.vtk.be'
    );
  });
});

describe('isEditableDestination', () => {
  it('aanvaardt wat een redacteur bedoelt', () => {
    // Vaste routes zonder CMS-pagina; enkel zo krijg je ze in een menu.
    expect(isEditableDestination('/praesidium')).toBe(true);
    expect(isEditableDestination('/piano')).toBe(true);
    expect(isEditableDestination('https://cudi.vtk.be/vtk/shop')).toBe(true);
    expect(isEditableDestination('http://localhost:3000/kalender')).toBe(true);
  });

  it('weigert wat niet in een redactievak hoort', () => {
    // Ziet eruit als een pad, wijst naar een andere host.
    expect(isEditableDestination('//cudi.vtk.be')).toBe(false);
    expect(isEditableDestination('/\\evil.com')).toBe(false);
    expect(isEditableDestination('javascript:alert(1)')).toBe(false);
    expect(isEditableDestination('cudi.vtk.be')).toBe(false);
    expect(isEditableDestination('')).toBe(false);
  });

  it('laat een scherm extra schemas toestaan', () => {
    // De linkpagina is een knoppenlijst uit een bio: bellen en mailen hoort daar.
    expect(isEditableDestination('mailto:it@vtk.be')).toBe(false);
    expect(isEditableDestination('mailto:it@vtk.be', ['mailto:', 'tel:'])).toBe(true);
    expect(isEditableDestination('tel:+3216000000', ['mailto:', 'tel:'])).toBe(true);
  });

  it('is het spiegelbeeld van isExternalUrl voor wat het toelaat', () => {
    // Wat opslaanbaar is, moet ook correct gerenderd worden: intern zonder
    // nieuw tabblad, extern met. Deze twee mogen dus niet uiteenlopen.
    for (const url of ['/praesidium', 'https://cudi.vtk.be', '/info/uitleendienst']) {
      expect(isEditableDestination(url)).toBe(true);
      expect(isExternalUrl(url)).toBe(!isSameSitePath(url));
    }
  });
});
