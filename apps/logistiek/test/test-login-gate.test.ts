import { describe, expect, it } from 'vitest';
import { mayUseTestLogin, testLoginMode } from '../lib/test-login-gate';

describe('testLoginMode', () => {
  it('kent de twee standen en valt anders terug op uit', () => {
    expect(testLoginMode({ LOGISTIEK_TEST_LOGIN: 'true' })).toBe('gated');
    expect(testLoginMode({ LOGISTIEK_TEST_LOGIN: 'open' })).toBe('open');
    expect(testLoginMode({ LOGISTIEK_TEST_LOGIN: '' })).toBe('off');
    expect(testLoginMode({})).toBe('off');
    // Geen "yes"/"1"/"TRUE"-vriendelijkheid: bij een vlag die superadmin uitdeelt
    // is een tikfout beter uit dan aan.
    expect(testLoginMode({ LOGISTIEK_TEST_LOGIN: 'TRUE' })).toBe('off');
  });
});

describe('mayUseTestLogin', () => {
  it('laat niemand door wanneer het uit staat', () => {
    expect(mayUseTestLogin('off', { canManage: true })).toBe(false);
  });

  it('laat in de ongegrendelde stand ook een bezoeker zonder sessie door', () => {
    // Die stand bestaat voor een laptop waar vtk.be niet draait: daar is er geen
    // echte login om op te gaten.
    expect(mayUseTestLogin('open', null)).toBe(true);
  });

  it('laat gegrendeld enkel wie logistiek mag beheren door', () => {
    expect(mayUseTestLogin('gated', { canManage: true })).toBe(true);
    expect(mayUseTestLogin('gated', { canManage: false })).toBe(false);
    expect(mayUseTestLogin('gated', null)).toBe(false);
  });
});
