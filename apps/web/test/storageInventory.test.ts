import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-s3')>();
  return {
    ...actual,
    S3Client: class {
      send = mocks.send;
    },
  };
});

import { getObjectStorageInventory, setS3ConfigResolver } from '@vtk/storage';

beforeEach(() => {
  vi.clearAllMocks();
  setS3ConfigResolver(async () => ({
    endpoint: 'http://s3.test',
    accessKeyId: 'access',
    secretAccessKey: 'secret',
    bucket: 'vtk',
    region: 'test',
    forcePathStyle: true,
  }));
});

describe('S3 bucket inventory', () => {
  it('follows continuation tokens so buckets over 1,000 objects are not undercounted', async () => {
    mocks.send
      .mockResolvedValueOnce({
        Contents: [{ Key: 'avatars/a.jpg', Size: 100 }],
        IsTruncated: true,
        NextContinuationToken: 'next-page',
      })
      .mockResolvedValueOnce({
        Contents: [{ Key: 'bonnetjes/b.pdf', Size: 250 }],
        IsTruncated: false,
      });

    const inventory = await getObjectStorageInventory();

    expect(inventory).toMatchObject({ bucket: 'vtk', totalBytes: 350 });
    expect(inventory.objects).toHaveLength(2);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls.map(([command]) => command.input.ContinuationToken)).toEqual([
      undefined,
      'next-page',
    ]);
  });

  it('fails loudly when S3 says there is another page but omits its token', async () => {
    mocks.send.mockResolvedValueOnce({ Contents: [], IsTruncated: true });

    await expect(getObjectStorageInventory()).rejects.toThrow('without a continuation token');
  });
});
