import { describe, expect, it } from 'vitest';
import { UnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error';
import { unsentSaveMessage, unsentSaveReason } from '@/lib/unsentSave';

describe('unsentSaveReason', () => {
  it('recognises an action that no longer exists after a deploy', () => {
    expect(unsentSaveReason(new UnrecognizedActionError('Server Action "60ff" was not found on the server.'))).toBe(
      'stale',
    );
  });

  it('recognises a request that never left the browser', () => {
    expect(unsentSaveReason(new TypeError('Failed to fetch'))).toBe('offline');
    expect(unsentSaveReason(new TypeError('NetworkError when attempting to fetch resource.'))).toBe('offline');
    expect(unsentSaveReason(new TypeError('Load failed'))).toBe('offline');
  });

  it('leaves every other error to the error boundary', () => {
    expect(unsentSaveReason(new Error('boom'))).toBeNull();
    expect(unsentSaveReason(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBeNull();
    expect(unsentSaveReason(Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;push;/x;307;' }))).toBeNull();
    expect(unsentSaveReason(undefined)).toBeNull();
  });

  it('tells the user their input is still there, in both languages', () => {
    expect(unsentSaveMessage('stale', false)).toMatch(/staat er nog/);
    expect(unsentSaveMessage('stale', true)).toMatch(/still here/);
    expect(unsentSaveMessage('offline', false)).toMatch(/geen verbinding/);
  });
});
