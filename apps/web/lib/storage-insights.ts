import 'server-only';

import { execFile } from 'node:child_process';
import { access, statfs } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { promisify } from 'node:util';
import { prisma } from '@vtk/db';
import { faceSearchConfig, getImmichStorageReport, type ImmichStorageReport } from '@vtk/gallery';
import { getObjectStorageInventory } from '@vtk/storage';
import { Client } from 'pg';
import { getS3Status, type S3Status } from '@/lib/runtimeConfig';
import {
  REFERENCED_STORAGE_FEATURES,
  STORAGE_FEATURES,
  UNKNOWN_STORAGE_FEATURE,
  storageFeatureForKey,
} from '@/lib/storage-categories';

const execFileAsync = promisify(execFile);

export type StorageSource<T> =
  | { available: true; data: T }
  | { available: false; reason: 'not-configured' | 'unavailable' };

export type S3FeatureUsage = {
  id: string;
  label: string;
  description: string;
  objectCount: number;
  bytes: number;
};

export type S3StorageUsage = {
  bucket: string;
  totalBytes: number;
  objectCount: number;
  largestObjectBytes: number;
  features: S3FeatureUsage[];
};

export type LocalFilesystemUsage = {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
};

export type LocalStorageSource = {
  id: string;
  label: string;
  description: string;
  bytes: number;
  kind: 'database' | 'runtime' | 'backup' | 'cache';
};

export type LocalStorageUsage = {
  filesystem: StorageSource<LocalFilesystemUsage>;
  sources: LocalStorageSource[];
  notes: string[];
};

export type StorageInsights = {
  measuredAt: string;
  s3Status: S3Status;
  s3: StorageSource<S3StorageUsage>;
  immich: ImmichStorageReport;
  local: LocalStorageUsage;
};

function appPaths() {
  const cwd = process.cwd();
  const appDir = basename(cwd) === 'web' ? cwd : resolve(cwd, 'apps/web');
  const root = resolve(appDir, '../..');
  return { appDir, root };
}

function numberFromBigInt(value: bigint): number {
  return Number(value > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : value);
}

async function filesystemUsage(path: string): Promise<LocalFilesystemUsage> {
  const stats = await statfs(path, { bigint: true });
  const total = stats.blocks * stats.bsize;
  const used = (stats.blocks - stats.bfree) * stats.bsize;
  const available = stats.bavail * stats.bsize;
  return {
    totalBytes: numberFromBigInt(total),
    usedBytes: numberFromBigInt(used),
    availableBytes: numberFromBigInt(available),
  };
}

async function directorySize(path: string): Promise<number | null> {
  try {
    await access(path);
  } catch {
    return null;
  }

  try {
    // `du` is part of BusyBox in the production Alpine image and is much less
    // expensive than issuing one JavaScript stat call per node_modules file.
    const { stdout } = await execFileAsync('du', ['-sk', path], {
      timeout: 15_000,
      maxBuffer: 64 * 1024,
    });
    const kibibytes = Number.parseInt(String(stdout).trim().split(/\s+/)[0] || '', 10);
    return Number.isFinite(kibibytes) ? kibibytes * 1024 : null;
  } catch {
    return null;
  }
}

async function postgresDatabaseSources(): Promise<LocalStorageSource[]> {
  const rows = await prisma.$queryRaw<Array<{ name: string; bytes: string; current: boolean }>>`
    select
      datname as name,
      pg_database_size(datname)::text as bytes,
      datname = current_database() as current
    from pg_database
    where datallowconn is true
      and datistemplate is false
    order by pg_database_size(datname) desc
  `;

  return rows.map((row) => {
    const isVault = /vault/i.test(row.name);
    return {
      id: `postgres-${row.name}`,
      label: row.current ? 'VTK application database' : isVault ? 'Vaultwarden database' : `PostgreSQL: ${row.name}`,
      description: row.current
        ? 'All website, admin, member, ticketing and logistics records, including indexes.'
        : isVault
          ? 'Password-vault records and indexes in the shared PostgreSQL cluster.'
          : 'Another database in the PostgreSQL cluster used by the deployment.',
      bytes: Math.max(0, Number(row.bytes) || 0),
      kind: 'database' as const,
    };
  });
}

async function immichDatabaseSource(): Promise<LocalStorageSource | null> {
  const database = faceSearchConfig('main').database;
  if (!database.host || !database.database || !database.user || !database.password) return null;

  const client = new Client({
    host: database.host,
    port: database.port,
    database: database.database,
    user: database.user,
    password: database.password,
    connectionTimeoutMillis: 4_000,
    query_timeout: 5_000,
    statement_timeout: 5_000,
  });

  try {
    await client.connect();
    const result = await client.query<{ bytes: string }>(
      'select pg_database_size(current_database())::text as bytes',
    );
    return {
      id: 'immich-database',
      label: 'Immich metadata database',
      description: 'Albums, asset metadata, faces and search indexes; the photo files themselves are not included.',
      bytes: Math.max(0, Number(result.rows[0]?.bytes) || 0),
      kind: 'database',
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function getLocalStorageUsage(): Promise<LocalStorageUsage> {
  const { appDir, root } = appPaths();
  const notes: string[] = [];

  const filesystemPromise = filesystemUsage(appDir);
  const databasesPromise = postgresDatabaseSources();
  const immichDatabasePromise = immichDatabaseSource();
  const directoryDefinitions = [
    {
      id: 'dependencies',
      path: resolve(root, 'node_modules'),
      label: 'Application dependencies',
      description: 'Installed Node.js packages in the running web image.',
      kind: 'runtime' as const,
    },
    {
      id: 'web-build',
      path: resolve(appDir, '.next'),
      label: 'Web build output',
      description: 'Compiled Next.js server, client assets and build cache visible to this process.',
      kind: 'runtime' as const,
    },
    {
      id: 'shared-packages',
      path: resolve(root, 'packages'),
      label: 'Shared application packages',
      description: 'Runtime source and generated Prisma client copied into the web image.',
      kind: 'runtime' as const,
    },
    {
      id: 'public-assets',
      path: resolve(appDir, 'public'),
      label: 'Bundled public assets',
      description: 'Static images, fonts and other files shipped with the website.',
      kind: 'runtime' as const,
    },
    {
      id: 'web-runtime-source',
      path: resolve(appDir, 'lib'),
      label: 'Web runtime source',
      description: 'Server helpers copied alongside the production Next.js build.',
      kind: 'runtime' as const,
    },
    {
      id: 'runtime-temp',
      path: '/tmp',
      label: 'Runtime temporary files',
      description: 'Temporary files and caches inside the web container.',
      kind: 'cache' as const,
    },
    {
      id: 'backups',
      path: resolve(root, 'backups'),
      label: 'Database backups visible to the app',
      description: 'Compressed dumps made by the repository backup script, when mounted into this runtime.',
      kind: 'backup' as const,
    },
  ];

  const [filesystemResult, databasesResult, immichDatabaseResult, directoryResults] = await Promise.all([
    filesystemPromise.then(
      (data) => ({ available: true, data }) as const,
      () => ({ available: false, reason: 'unavailable' }) as const,
    ),
    databasesPromise.catch(() => null),
    immichDatabasePromise.catch(() => null),
    Promise.all(directoryDefinitions.map(async (definition) => ({ definition, bytes: await directorySize(definition.path) }))),
  ]);

  if (!databasesResult) notes.push('Logical sizes for the main PostgreSQL cluster could not be read.');
  if (!immichDatabaseResult) {
    notes.push('The Immich metadata database size is unavailable or its database connection is not configured.');
  }

  const sources: LocalStorageSource[] = [
    ...(databasesResult ?? []),
    ...(immichDatabaseResult ? [immichDatabaseResult] : []),
    ...directoryResults.flatMap(({ definition, bytes }) =>
      bytes === null
        ? []
        : [{
            id: definition.id,
            label: definition.label,
            description: definition.description,
            bytes,
            kind: definition.kind,
          }],
    ),
  ].sort((left, right) => right.bytes - left.bytes);

  notes.push(
    'The filesystem total includes the entire disk visible to the container. The source list only includes paths and databases the web process can safely inspect, so it is not expected to add up to that total.',
  );
  notes.push(
    'Docker image layers, system logs and storage owned by other host services are intentionally not mounted into the web container and cannot be attributed here.',
  );

  return { filesystem: filesystemResult, sources, notes };
}

export function summarizeS3Objects(
  objects: readonly { key: string; sizeBytes: number }[],
  bucket: string,
  referencedFeatures: ReadonlyMap<string, string> = new Map(),
): S3StorageUsage {
  const usages = new Map<string, S3FeatureUsage>();
  for (const definition of [...REFERENCED_STORAGE_FEATURES, ...STORAGE_FEATURES, UNKNOWN_STORAGE_FEATURE]) {
    usages.set(definition.id, {
      id: definition.id,
      label: definition.label,
      description: definition.description,
      objectCount: 0,
      bytes: 0,
    });
  }

  for (const object of objects) {
    const definition = storageFeatureForKey(object.key, referencedFeatures.get(object.key));
    const usage = usages.get(definition.id);
    if (!usage) continue;
    usage.objectCount += 1;
    usage.bytes += Math.max(0, object.sizeBytes || 0);
  }

  return {
    bucket,
    totalBytes: objects.reduce((total, object) => total + Math.max(0, object.sizeBytes || 0), 0),
    objectCount: objects.length,
    largestObjectBytes: objects.reduce((largest, object) => Math.max(largest, object.sizeBytes || 0), 0),
    features: [...usages.values()]
      .filter((usage) => usage.objectCount > 0)
      .sort((left, right) => right.bytes - left.bytes || right.objectCount - left.objectCount),
  };
}

function imageKeyFromFormConfig(config: unknown): string | null {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return null;
  const value = (config as Record<string, unknown>).imageKey;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Verfijnt vooral de gedeelde `images/`-prefix met de actuele DB-verwijzingen.
 * Eén object dat door verschillende features hergebruikt wordt krijgt een eigen
 * gedeelde categorie: fysiek mag het maar één keer meegeteld worden.
 */
async function getReferencedStorageFeatures(): Promise<Map<string, string>> {
  const [groups, headerTabs, headerLinks, pages, events, formFields, products, sessionItems] = await Promise.all([
    prisma.group.findMany({ where: { photoKey: { not: null } }, select: { photoKey: true } }),
    prisma.headerTab.findMany({ where: { imageKey: { not: null } }, select: { imageKey: true } }),
    prisma.headerTabLink.findMany({ where: { imageKey: { not: null } }, select: { imageKey: true } }),
    prisma.page.findMany({ where: { imageKey: { not: null } }, select: { imageKey: true } }),
    prisma.calendarEvent.findMany({ where: { imageKey: { not: null } }, select: { imageKey: true } }),
    prisma.formField.findMany({ select: { config: true } }),
    prisma.theokotProduct.findMany({ where: { imageKey: { not: null } }, select: { imageKey: true } }),
    prisma.theokotSessionItem.findMany({ where: { imageKey: { not: null } }, select: { imageKey: true } }),
  ]);

  const references = new Map<string, Set<string>>();
  const add = (featureId: string, keys: Array<string | null | undefined>) => {
    for (const key of keys) {
      if (!key) continue;
      const features = references.get(key) ?? new Set<string>();
      features.add(featureId);
      references.set(key, features);
    }
  };

  add('post-photos', groups.map((row) => row.photoKey));
  add('homepage-images', headerTabs.map((row) => row.imageKey));
  add('page-images', [...headerLinks.map((row) => row.imageKey), ...pages.map((row) => row.imageKey)]);
  add('event-images', events.map((row) => row.imageKey));
  add('form-images', formFields.map((row) => imageKeyFromFormConfig(row.config)));
  add('theokot-images', [...products.map((row) => row.imageKey), ...sessionItems.map((row) => row.imageKey)]);

  return new Map(
    [...references].map(([key, features]) => [
      key,
      features.size === 1 ? [...features][0]! : 'shared-images',
    ]),
  );
}

async function getS3Usage(): Promise<StorageSource<S3StorageUsage>> {
  try {
    const [inventory, referencedFeatures] = await Promise.all([
      getObjectStorageInventory(),
      getReferencedStorageFeatures().catch(() => new Map<string, string>()),
    ]);
    return {
      available: true,
      data: summarizeS3Objects(inventory.objects, inventory.bucket, referencedFeatures),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return {
      available: false,
      reason: /not configured/i.test(message) ? 'not-configured' : 'unavailable',
    };
  }
}

export async function getStorageInsights(): Promise<StorageInsights> {
  const [s3Status, s3, immich, local] = await Promise.all([
    getS3Status(),
    getS3Usage(),
    getImmichStorageReport(),
    getLocalStorageUsage(),
  ]);

  return {
    measuredAt: new Date().toISOString(),
    s3Status,
    s3,
    immich,
    local,
  };
}
