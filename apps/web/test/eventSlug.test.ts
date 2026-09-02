import { describe, expect, it } from 'vitest';
import { SLUG_PATTERN, eventSlugBase, eventSlugYear, slugify } from '@vtk/db/slug';

/** 12 maart 2026, 20u30 Brusselse tijd. */
const MAART = new Date('2026-03-12T19:30:00.000Z');

describe('slugify', () => {
  it('maakt van een titel kleine letters met koppeltekens', () => {
    expect(slugify('Galabal der Ingenieurs')).toBe('galabal-der-ingenieurs');
  });

  it('haalt accenten weg in plaats van ze te vervangen door een koppelteken', () => {
    expect(slugify('Café Théâtre')).toBe('cafe-theatre');
  });

  it('laat geen koppelteken aan het begin of het einde staan', () => {
    expect(slugify('  ¡Fiesta!  ')).toBe('fiesta');
  });

  it('geeft een lege string wanneer er niets bruikbaars overblijft', () => {
    expect(slugify('🎉🎉')).toBe('');
  });
});

describe('eventSlugYear', () => {
  it('gebruikt de Brusselse dag en niet die van UTC', () => {
    // 1 januari 2026 om 00u30 in Brussel is 31 december 2025 in UTC. De bezoeker
    // las 2026 op zijn uitnodiging, dus dat hoort in de URL te staan.
    expect(eventSlugYear(new Date('2025-12-31T23:30:00.000Z'))).toBe('2026');
  });
});

describe('eventSlugBase', () => {
  it('zet het jaartal achter de titel', () => {
    expect(eventSlugBase('Galabal', MAART)).toBe('galabal-2026');
  });

  it('valt terug op "evenement" wanneer de titel geen letters of cijfers heeft', () => {
    expect(eventSlugBase('🎉', MAART)).toBe('evenement-2026');
  });

  it('kapt een lange titel af zonder een dubbel koppelteken te maken', () => {
    // Op teken 60 valt hier net een koppelteken; zonder de trim zou de slug op
    // "--2026" eindigen en niet meer aan SLUG_PATTERN voldoen.
    const long = 'a'.repeat(59) + ' bis';
    const slug = eventSlugBase(long, MAART);
    expect(slug).not.toContain('--');
    expect(slug).toMatch(SLUG_PATTERN);
  });

  it('levert altijd iets op dat als URL-naam mag doorgaan', () => {
    for (const title of ['Galabal', '24 Urenloop', 'Café Théâtre', '🎉', 'a'.repeat(200)]) {
      expect(eventSlugBase(title, MAART)).toMatch(SLUG_PATTERN);
    }
  });
});
