import 'server-only';
import { prisma } from '@vtk/db';
import type { S3Config } from '@vtk/storage';
import { decryptSecret } from './secrets';

/**
 * Live S3-config voor de storage-resolver, gelezen uit dezelfde `Setting`-rij
 * (`s3.config`) die de web-admin beheert. DB wint; anders de omgeving. Minimale
 * kopie van apps/web/lib/runtimeConfig.ts (enkel S3, geen Sentry).
 */

const S3_SETTING_KEY = 's3.config';

type StoredS3 = {
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKeyEnc?: string;
  bucket?: string;
  region?: string;
  forcePathStyle?: boolean;
};

function envS3(): S3Config {
  return {
    endpoint: process.env.S3_ENDPOINT || '',
    accessKeyId: process.env.S3_ACCESS_KEY || '',
    secretAccessKey: process.env.S3_SECRET_KEY || '',
    bucket: process.env.S3_BUCKET || '',
    region: process.env.S3_REGION || 'fsn1',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
  };
}

function isComplete(v: StoredS3 | null | undefined): v is StoredS3 {
  return Boolean(v && v.endpoint && v.accessKeyId && v.secretAccessKeyEnc && v.bucket);
}

export async function getS3Config(): Promise<S3Config> {
  const env = envS3();
  try {
    const row = await prisma.setting.findUnique({ where: { key: S3_SETTING_KEY } });
    const v = (row?.value ?? null) as unknown as StoredS3 | null;
    if (isComplete(v)) {
      return {
        endpoint: v.endpoint!,
        accessKeyId: v.accessKeyId!,
        secretAccessKey: decryptSecret(v.secretAccessKeyEnc!),
        bucket: v.bucket!,
        region: v.region || env.region,
        forcePathStyle: v.forcePathStyle ?? env.forcePathStyle,
      };
    }
  } catch {
    /* val terug op env */
  }
  return env;
}
