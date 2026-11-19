import { beforeAll, describe, expect, it, vi } from 'vitest';
import { UnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error';

/*
 * Het vangnet draait in de browser. Zonder jsdom zetten we hier enkel neer wat
 * het gebruikt: een `submit`-luisteraar op document, de taal van <html>, en
 * een window om de melding op te sturen. EventTarget en CustomEvent heeft Node
 * zelf.
 */
class FakeForm extends EventTarget {}
let submitListener: ((event: { target: unknown }) => void) | null = null;
const page = new EventTarget();
const alerts: string[] = [];

beforeAll(() => {
  vi.stubGlobal('HTMLFormElement', FakeForm);
  vi.stubGlobal('document', {
    documentElement: { lang: 'nl-BE' },
    addEventListener: (type: string, listener: (event: { target: unknown }) => void) => {
      if (type === 'submit') submitListener = listener;
    },
  });
  vi.stubGlobal('window', Object.assign(page, { alert: (message: string) => alerts.push(message) }));
});

async function load() {
  return import('@/components/ui/unsentGuard');
}

const stale = () => new UnrecognizedActionError('Server Action "60ff" was not found on the server.');

describe('unsentGuard', () => {
  it('geeft UNSENT terug en toont één melding als de action niet meer bestaat', async () => {
    const { UNSENT, UNSENT_TOAST_EVENT, unsentGuard } = await load();
    const shown: string[] = [];
    const onToast = (event: Event) => {
      event.preventDefault();
      shown.push((event as CustomEvent<{ message: string }>).detail.message);
    };
    page.addEventListener(UNSENT_TOAST_EVENT, onToast);
    try {
      const result = await unsentGuard.run(() => Promise.reject(stale()));
      expect(result).toBe(UNSENT);
      expect(shown).toHaveLength(1);
      expect(shown[0]).toMatch(/^Niet opgeslagen: de site werd bijgewerkt/);
      expect(alerts).toEqual([]);
    } finally {
      page.removeEventListener(UNSENT_TOAST_EVENT, onToast);
    }
  });

  it('valt terug op een alert wanneer er geen toastprovider luistert', async () => {
    const { unsentGuard } = await load();
    await unsentGuard.run(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(alerts.pop()).toMatch(/geen verbinding/);
  });

  it('laat een gewone uitkomst en elke andere fout ongemoeid', async () => {
    const { unsentGuard } = await load();
    await expect(unsentGuard.run(async () => 42)).resolves.toBe(42);
    await expect(unsentGuard.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(unsentGuard.form(() => Promise.reject(new Error('boom')))()).rejects.toThrow('boom');
  });

  it('houdt bij useActionState de vorige state, en bij een formulier geen fout', async () => {
    const { unsentGuard } = await load();
    const previous = { status: 'idle' } as const;
    const action = unsentGuard.state<typeof previous, [FormData]>(async () => {
      throw stale();
    });
    await expect(action(previous, new FormData())).resolves.toBe(previous);
    await expect(unsentGuard.form(() => Promise.reject(stale()))()).resolves.toBeUndefined();
  });

  it('houdt de reset tegen die React na de action op het verstuurde formulier doet', async () => {
    const { unsentGuard } = await load();
    const form = new FakeForm();
    submitListener?.({ target: form });
    await unsentGuard.form(() => Promise.reject(stale()))();

    const reset = new Event('reset', { cancelable: true });
    form.dispatchEvent(reset);
    expect(reset.defaultPrevented).toBe(true);

    // Eén keer: een reset die later komt, gaat gewoon door.
    const later = new Event('reset', { cancelable: true });
    form.dispatchEvent(later);
    expect(later.defaultPrevented).toBe(false);
  });
});
