import { describe, expect, it } from 'vitest';
import { CLAIMS, CLAIM_NAMES, SCOPE_CODES, TRANSFORMER_NAMES, claimsForScope, transform } from '@vtk/auth';

describe('transformers', () => {
  it('returns null for null input instead of throwing', () => {
    // Een transformer die gooit, legt het uitgeven van tokens plat voor elke
    // client omdat één claim stuk is.
    for (const name of TRANSFORMER_NAMES) {
      expect(() => transform(null, name)).not.toThrow();
      expect(() => transform(undefined, name)).not.toThrow();
    }
  });

  it('never throws on wildly wrong input types', () => {
    const junk = [{}, [], Symbol('x'), () => {}, NaN, Infinity, ''];
    for (const name of TRANSFORMER_NAMES) {
      for (const value of junk) expect(() => transform(value, name)).not.toThrow();
    }
  });

  it('localPart takes the part before the @', () => {
    expect(transform('jan.janssens@student.kuleuven.be', 'localPart')).toBe('jan.janssens');
    expect(transform(null, 'localPart')).toBeNull();
  });

  it('bcp47 maps VTK locales to real language tags', () => {
    expect(transform('NL', 'bcp47')).toBe('nl-BE');
    expect(transform('EN', 'bcp47')).toBe('en');
  });

  it('isoDate produces a date without a time component', () => {
    expect(transform(new Date('2003-05-17T23:30:00Z'), 'isoDate')).toBe('2003-05-17');
    expect(transform('not a date', 'isoDate')).toBeNull();
  });

  it('unixSeconds produces epoch seconds, not milliseconds', () => {
    expect(transform(new Date('2026-01-01T00:00:00Z'), 'unixSeconds')).toBe(1767225600);
  });

  it('enumArray lowercases and drops nulls', () => {
    expect(transform(['COMPUTER_SCIENCE', 'CIVIL'], 'enumArray')).toEqual(['computer_science', 'civil']);
    expect(transform([], 'enumArray')).toEqual([]);
    expect(transform('COMPUTER_SCIENCE', 'enumArray')).toBeNull();
  });

  it('isNotNull answers even when the field is empty', () => {
    expect(transform(null, 'isNotNull')).toBe(false);
    expect(transform(new Date(), 'isNotNull')).toBe(true);
  });

  it('redactExceptLast keeps only the tail', () => {
    expect(transform('r0123456', 'redactExceptLast', { keep: 4 })).toBe('****3456');
    expect(transform('abc', 'redactExceptLast', { keep: 4 })).toBe('abc');
  });

  it('storageUrl produces an absolute URL, since a client cannot use a relative one', () => {
    const value = transform('avatars/jan.png', 'storageUrl');
    expect(typeof value).toBe('string');
    expect(String(value)).toContain('/api/media/avatars/jan.png');
  });
});

describe('claim registry', () => {
  it('has unique claim names', () => {
    expect(new Set(CLAIM_NAMES).size).toBe(CLAIM_NAMES.length);
  });

  it('only hangs claims off scopes that actually exist', () => {
    // Een claim onder een onbestaande scope komt nooit vrij en is stil dood.
    for (const claim of CLAIMS) expect(SCOPE_CODES).toContain(claim.scope);
  });

  it('gives every claim at least one destination and a known transformer', () => {
    for (const claim of CLAIMS) {
      expect(claim.destinations.length).toBeGreaterThan(0);
      expect(TRANSFORMER_NAMES).toContain(claim.transformer);
    }
  });

  it('never puts protocol claims in the registry', () => {
    // Die zet de plugin zelf; ze hier overschrijven breekt de tokenvalidatie.
    for (const reserved of ['sub', 'iss', 'aud', 'exp', 'iat', 'azp', 'nonce']) {
      expect(CLAIM_NAMES).not.toContain(reserved);
    }
  });

  it('keeps the student number behind its own scope', () => {
    const studentNumber = CLAIMS.find((claim) => claim.name === 'vtk:student_number');
    expect(studentNumber?.scope).toBe('vtk:student_number');

    // Wie enkel de richting vraagt, hoort het nummer niet te krijgen.
    const programmeClaims = claimsForScope('vtk:study_programme').map((claim) => claim.name);
    expect(programmeClaims).not.toContain('vtk:student_number');
  });

  it('keeps sensitive personal data out of the ID token', () => {
    // Een ID token wordt één keer uitgegeven en veroudert; gevoelige gegevens
    // horen in UserInfo, dat live opgehaald wordt.
    const sensitive = ['vtk:student_number', 'vtk:personal_email', 'birthdate', 'address'];
    for (const name of sensitive) {
      const claim = CLAIMS.find((c) => c.name === name);
      expect(claim, `${name} bestaat niet meer`).toBeDefined();
      expect(claim!.destinations, `${name} hoort niet in het ID token`).not.toContain('id_token');
    }
  });

  it('never exposes VTK org structure to a client', () => {
    // Een client beslist op een permissie die hij zelf definieert (fase 5), niet
    // op onze rollen, posten of interne permissievocabulaire. Komt een van deze
    // claims terug, dan schrijft de volgende integratie onze postenstructuur in
    // zijn code.
    for (const name of ['vtk:roles', 'vtk:permissions', 'vtk:groups', 'vtk:is_praesidium']) {
      expect(CLAIM_NAMES, `${name} hoort niet naar een client te gaan`).not.toContain(name);
    }
  });

  it('keeps `email` on the university address, with the preferred one separate', () => {
    // `email` is de identiteitsclaim en moet stabiel zijn; het voorkeursadres
    // beweegt mee met een profielinstelling en hoort dus een eigen claim te zijn.
    const email = CLAIMS.find((claim) => claim.name === 'email');
    expect(email?.source).toEqual({ kind: 'USER_FIELD', field: 'email' });
    expect(CLAIM_NAMES).toContain('vtk:preferred_email');
  });
});
