import { describe, expect, it } from 'vitest';
import { announcementFits } from '@/lib/announcementScope';

describe('waar een aankondiging verschijnt', () => {
  it('toont een homepage-bericht enkel op de homepage', () => {
    expect(announcementFits('HOME', '/nl')).toBe(true);
    expect(announcementFits('HOME', '/en')).toBe(true);
    expect(announcementFits('HOME', '/nl/media')).toBe(false);
    expect(announcementFits('HOME', '/en/tickets')).toBe(false);
  });

  it('toont een site-breed bericht op elke gewone pagina', () => {
    expect(announcementFits('SITE', '/nl')).toBe(true);
    expect(announcementFits('SITE', '/nl/media')).toBe(true);
    expect(announcementFits('SITE', '/en/info/shiften')).toBe(true);
  });

  it('houdt het venster weg van beheer, scanner en afrekenen', () => {
    // Een reclamevenster over een lopende betaling is geen aankondiging maar een
    // storing; de scanner draait op een gsm aan de deur.
    for (const scope of ['HOME', 'SITE'] as const) {
      expect(announcementFits(scope, '/nl/admin')).toBe(false);
      expect(announcementFits(scope, '/nl/admin/tickets')).toBe(false);
      expect(announcementFits(scope, '/en/scan')).toBe(false);
      expect(announcementFits(scope, '/nl/tickets/bestelling/abc123')).toBe(false);
    }
    // Maar /tickets zelf is een gewone pagina, geen afrekenscherm.
    expect(announcementFits('SITE', '/nl/tickets')).toBe(true);
  });

  it('trekt zich niets aan van een querystring of een slash op het einde', () => {
    expect(announcementFits('HOME', '/nl/')).toBe(true);
    expect(announcementFits('SITE', '/nl/admin/?tab=1')).toBe(false);
  });

  it('werkt ook zonder taalvoorvoegsel', () => {
    // `x-pathname` draagt er altijd een, maar deze functie mag daar niet van
    // afhangen: een leeg pad hoort niet stil "elke pagina" te betekenen.
    expect(announcementFits('HOME', '/')).toBe(true);
    expect(announcementFits('HOME', '/media')).toBe(false);
    expect(announcementFits('SITE', '/admin')).toBe(false);
  });
});
