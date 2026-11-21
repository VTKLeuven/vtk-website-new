import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hasTranslation, localizeActionResult, translateActionText } from '@/lib/action-translations';
import { FORM_MESSAGES } from '@/lib/form-messages';

/**
 * Elke melding die een ledenactie teruggeeft, bestaat ook in het Engels (N3).
 *
 * De Nederlandse zin in `app/actions/uitleen.ts` is de bron; deze test leest
 * het bestand en faalt voor elke zin die nog geen vertaling heeft in
 * `lib/action-translations.ts`. Zo valt een nieuwe melding op voor ze bij een
 * Engelstalig lid in het Nederlands verschijnt.
 */

const source = readFileSync(path.resolve(__dirname, '../app/actions/uitleen.ts'), 'utf8');

function staticMessages(): string[] {
  const found = new Set<string>();
  const pattern = /\b(?:error|message)\s*:\s*\n?\s*'((?:[^'\\]|\\.)*)'/g;
  for (const match of source.matchAll(pattern)) found.add(match[1].replace(/\\'/g, "'"));
  // Ook de takken van een `cond ? 'a' : 'b'` achter `message:`.
  for (const match of source.matchAll(/message:\s*[^,]*\?\s*'((?:[^'\\]|\\.)*)'\s*:\s*'((?:[^'\\]|\\.)*)'/g)) {
    found.add(match[1]);
    found.add(match[2]);
  }
  return [...found];
}

describe('vertaling van de ledenacties', () => {
  it('heeft voor elke vaste melding een Engelse zin', () => {
    const missing = staticMessages().filter((text) => !hasTranslation(text));
    expect(missing).toEqual([]);
  });

  it('vertaalt de meldingen met een gegeven erin', () => {
    expect(translateActionText('Sjabloon "Cantus" bewaard. Iedereen kan het nu kiezen.', 'en')).toBe(
      'Template "Cantus" saved. Everyone can choose it now.'
    );
    expect(translateActionText('Er passen er maximaal 4 op een rit.', 'en')).toBe('At most 4 fit on one trip.');
    expect(translateActionText('3 voertuigen aangevraagd. Je vindt de status bij Mijn aanvragen.', 'en')).toBe(
      '3 vehicles requested. You can follow the status under My requests.'
    );
    expect(translateActionText('Kar vraagt een goedgekeurde karchauffeur; vraag Logistiek om er een aan te duiden.', 'en')).toBe(
      'Kar needs an approved van driver; ask Logistics to assign one.'
    );
  });

  it('laat het Nederlands en een onbekende zin ongemoeid', () => {
    expect(translateActionText('Rit niet gevonden.', 'nl')).toBe('Rit niet gevonden.');
    expect(translateActionText('Iets nieuws dat nog niet vertaald is.', 'en')).toBe('Iets nieuws dat nog niet vertaald is.');
  });

  it('vertaalt enkel error en message van een resultaat', () => {
    expect(localizeActionResult({ ok: false, error: 'Rit niet gevonden.', code: 'X' }, 'en')).toEqual({
      ok: false,
      error: 'Trip not found.',
      code: 'X',
    });
    expect(localizeActionResult({ ok: true, url: 'https://pay' }, 'en')).toEqual({ ok: true, url: 'https://pay' });
    expect(localizeActionResult(undefined, 'en')).toBeUndefined();
  });

  it('geeft het formulier dezelfde sleutels in beide talen', () => {
    expect(Object.keys(FORM_MESSAGES.en).sort()).toEqual(Object.keys(FORM_MESSAGES.nl).sort());
    expect(FORM_MESSAGES.en.itemAvailable('Tafel', 2)).toBe('Only 2 of "Tafel" are available.');
  });
});
