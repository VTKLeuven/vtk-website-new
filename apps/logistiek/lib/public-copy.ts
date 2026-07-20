import 'server-only';

import { prisma } from '@vtk/db';
import { copy } from './i18n';
import type { LogistiekLocale } from './i18n-shared';

export const PUBLIC_COPY_SETTING_KEY = 'logistiek.publicCopy';
export const PUBLIC_COPY_MAX_LENGTH = 1500;

export const PUBLIC_COPY_KEYS = [
  'loginLead',
  'footerLead',
  'homeLead',
  'homeMaterialLead',
  'homeVanLead',
  'homeReservationsLead',
  'stepChoose',
  'stepRequest',
  'stepReturn',
  'infoTitle',
  'infoLead',
  'pageMaterialLead',
  'materialPaymentNote',
  'pageVanLead',
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
    homeLead: copy.nl.homeLead,
    homeMaterialLead: copy.nl.homeMaterialLead,
    homeVanLead: copy.nl.homeVanLead,
    homeReservationsLead: copy.nl.homeReservationsLead,
    stepChoose: copy.nl.stepChoose,
    stepRequest: copy.nl.stepRequest,
    stepReturn: copy.nl.stepReturn,
    infoTitle: copy.nl.infoTitle,
    infoLead: copy.nl.infoLead,
    pageMaterialLead: copy.nl.pageMaterialLead,
    materialPaymentNote: copy.nl.materialPaymentNote,
    pageVanLead: copy.nl.pageVanLead,
    vanDriverInfo: copy.nl.vanDriverInfo,
    vanTimingInfo: copy.nl.vanTimingInfo,
    vanPaymentInfo: copy.nl.vanPaymentInfo,
  },
  en: {
    loginLead: copy.en.loginLead,
    footerLead: copy.en.footerLead,
    homeLead: copy.en.homeLead,
    homeMaterialLead: copy.en.homeMaterialLead,
    homeVanLead: copy.en.homeVanLead,
    homeReservationsLead: copy.en.homeReservationsLead,
    stepChoose: copy.en.stepChoose,
    stepRequest: copy.en.stepRequest,
    stepReturn: copy.en.stepReturn,
    infoTitle: copy.en.infoTitle,
    infoLead: copy.en.infoLead,
    pageMaterialLead: copy.en.pageMaterialLead,
    materialPaymentNote: copy.en.materialPaymentNote,
    pageVanLead: copy.en.pageVanLead,
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
