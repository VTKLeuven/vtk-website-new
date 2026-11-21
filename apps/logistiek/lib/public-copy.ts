import 'server-only';

import { prisma } from '@vtk/db';
import { copy } from './i18n';
import type { LogistiekLocale } from './i18n-shared';

export const PUBLIC_COPY_SETTING_KEY = 'logistiek.publicCopy';
export const PUBLIC_COPY_MAX_LENGTH = 1500;

export const PUBLIC_COPY_KEYS = [
  'loginLead',
  'footerLead',
  'homeMaterialLead',
  'homeVanLead',
  'materialPaymentNote',
  'vanDriverInfo',
  'vanTimingInfo',
  'vanPaymentInfo',
] as const;

export type PublicCopyKey = (typeof PUBLIC_COPY_KEYS)[number];
export type PublicCopy = Record<PublicCopyKey, string>;
export type PublicCopyByLocale = Record<LogistiekLocale, PublicCopy>;

export const DEFAULT_PUBLIC_COPY: PublicCopyByLocale = {
  nl: {
    loginLead: copy.nl.loginLead,
    footerLead: copy.nl.footerLead,
    homeMaterialLead: copy.nl.homeMaterialLead,
    homeVanLead: copy.nl.homeVanLead,
    materialPaymentNote: copy.nl.materialPaymentNote,
    vanDriverInfo: copy.nl.vanDriverInfo,
    vanTimingInfo: copy.nl.vanTimingInfo,
    vanPaymentInfo: copy.nl.vanPaymentInfo,
  },
  en: {
    loginLead: copy.en.loginLead,
    footerLead: copy.en.footerLead,
    homeMaterialLead: copy.en.homeMaterialLead,
    homeVanLead: copy.en.homeVanLead,
    materialPaymentNote: copy.en.materialPaymentNote,
    vanDriverInfo: copy.en.vanDriverInfo,
    vanTimingInfo: copy.en.vanTimingInfo,
    vanPaymentInfo: copy.en.vanPaymentInfo,
  },
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function parsePublicCopy(value: unknown): PublicCopyByLocale {
  const root = record(value);

  return {
    nl: parseLocaleCopy(record(root.nl), DEFAULT_PUBLIC_COPY.nl),
    en: parseLocaleCopy(record(root.en), DEFAULT_PUBLIC_COPY.en),
  };
}

function parseLocaleCopy(value: Record<string, unknown>, defaults: PublicCopy): PublicCopy {
  return Object.fromEntries(
    PUBLIC_COPY_KEYS.map((key) => [
      key,
      typeof value[key] === 'string'
        ? value[key].slice(0, PUBLIC_COPY_MAX_LENGTH)
        : defaults[key],
    ])
  ) as PublicCopy;
}

export async function getPublicCopyByLocale(): Promise<PublicCopyByLocale> {
  const row = await prisma.setting.findUnique({
    where: { key: PUBLIC_COPY_SETTING_KEY },
    select: { value: true },
  });
  return parsePublicCopy(row?.value);
}

export async function getPublicCopy(locale: LogistiekLocale): Promise<PublicCopy> {
  return (await getPublicCopyByLocale())[locale];
}
