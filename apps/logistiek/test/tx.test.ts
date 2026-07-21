import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { isSerializationConflict, runSerializable } from '@/lib/tx';

const { txMock } = vi.hoisted(() => ({ txMock: vi.fn() }));
vi.mock('@vtk/db', () => ({ prisma: { $transaction: txMock } }));

const knownError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('boom', { code, clientVersion: 'test' });

describe('isSerializationConflict', () => {
  it('is true for a Prisma P2034 write-conflict/deadlock', () => {
    expect(isSerializationConflict(knownError('P2034'))).toBe(true);
  });

  it('is false for other known Prisma errors', () => {
    expect(isSerializationConflict(knownError('P2002'))).toBe(false); // unique constraint
    expect(isSerializationConflict(knownError('P2025'))).toBe(false); // record not found
  });

  it('is true for raw Postgres serialization/deadlock messages', () => {
    expect(isSerializationConflict(new Error('could not serialize access due to ... (40001)'))).toBe(true);
    expect(isSerializationConflict(new Error('deadlock detected'))).toBe(true);
    expect(isSerializationConflict(new Error('SQLSTATE 40P01'))).toBe(true);
  });

  it('is false for unrelated errors and non-errors', () => {
    expect(isSerializationConflict(new Error('validation failed'))).toBe(false);
    expect(isSerializationConflict('some string')).toBe(false);
    expect(isSerializationConflict(null)).toBe(false);
    expect(isSerializationConflict(undefined)).toBe(false);
  });
});

describe('runSerializable', () => {
  // Mirror the real $transaction: run the callback and propagate its result.
  beforeEach(() => {
    txMock.mockReset();
    txMock.mockImplementation((fn: () => Promise<unknown>) => fn());
  });

  it('returns the transaction result on first success', async () => {
    await expect(runSerializable(async () => 'ok')).resolves.toBe('ok');
    expect(txMock).toHaveBeenCalledTimes(1);
  });

  it('runs the transaction at Serializable isolation', async () => {
    await runSerializable(async () => 'ok');
    expect(txMock.mock.calls[0][1]).toEqual({ isolationLevel: 'Serializable' });
  });

  it('retries on a serialization conflict and eventually succeeds', async () => {
    let calls = 0;
    const work = async () => {
      calls += 1;
      if (calls < 3) throw knownError('P2034');
      return 'done';
    };
    await expect(runSerializable(work)).resolves.toBe('done');
    expect(calls).toBe(3);
  });

  it('gives up after the max attempts and rethrows the conflict', async () => {
    const work = async () => {
      throw knownError('P2034');
    };
    await expect(runSerializable(work)).rejects.toMatchObject({ code: 'P2034' });
    expect(txMock).toHaveBeenCalledTimes(3); // MAX_ATTEMPTS
  });

  it('does not retry a non-retryable error', async () => {
    const work = async () => {
      throw new Error('validation failed');
    };
    await expect(runSerializable(work)).rejects.toThrow('validation failed');
    expect(txMock).toHaveBeenCalledTimes(1);
  });
});
