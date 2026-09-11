import type { Locale } from "@vtk/i18n";

export type SloganItem = {
  id: string;
  titleNl: string;
  accentNl: string;
  tailNl?: string;
  titleEn?: string;
  accentEn?: string;
  tailEn?: string;
};

export type PersonalSlogan = {
  enabled: boolean;
  titleNl: string;
  accentNl: string;
  tailNl?: string;
  titleEn?: string;
  accentEn?: string;
  tailEn?: string;
  /** Kans in procent (0-100) dat de persoonlijke slogan als start gekozen wordt bij herladen. Standaard 50. */
  chancePercent?: number;
};

export type SlogansConfig = {
  items: SloganItem[];
  personal?: PersonalSlogan | null;
  /** Wisseltijd in seconden (bv. 8s). 0 = niet automatisch roteren. */
  intervalSeconds: number;
  /** Wisselen / randomizen bij elke paginalaadbeurt. */
  randomizeOnReload: boolean;
};

export type DisplaySlogan = {
  id: string;
  title: string;
  accent: string;
  tail: string;
  isPersonal?: boolean;
};

export const DEFAULT_SLOGAN_ITEMS: SloganItem[] = [
  {
    id: "default-1",
    titleNl: "Ingenieurs zijn",
    accentNl: "superieur.",
    tailNl: "",
    titleEn: "Engineers are",
    accentEn: "superior.",
    tailEn: "",
  },
  {
    id: "default-2",
    titleNl: "Al meer dan 100 jaar",
    accentNl: "thuis",
    tailNl: "in Leuven.",
    titleEn: "For over 100 years",
    accentEn: "at home",
    tailEn: "in Leuven.",
  },
  {
    id: "default-3",
    titleNl: "Van aula tot fakbar,",
    accentNl: "jouw kring.",
    tailNl: "",
    titleEn: "From lecture hall to fakbar,",
    accentEn: "your student society.",
    tailEn: "",
  },
];

export const DEFAULT_PERSONAL_SLOGAN: PersonalSlogan = {
  enabled: true,
  titleNl: "Welkom terug,",
  accentNl: "{firstName}!",
  tailNl: "",
  titleEn: "Welcome back,",
  accentEn: "{firstName}!",
  tailEn: "",
  chancePercent: 50,
};

export const DEFAULT_SLOGANS_CONFIG: SlogansConfig = {
  items: DEFAULT_SLOGAN_ITEMS,
  personal: DEFAULT_PERSONAL_SLOGAN,
  intervalSeconds: 8,
  randomizeOnReload: true,
};

/** Vervangt `{name}` door de volledige naam en `{firstName}` door de voornaam. */
export function interpolateName(
  template: string | null | undefined,
  name: string | null,
  firstName: string | null,
): string {
  if (!template) return "";
  let result = template;
  if (firstName) {
    result = result.replaceAll("{firstName}", firstName);
  } else if (name) {
    result = result.replaceAll("{firstName}", name);
  }
  if (name) {
    result = result.replaceAll("{name}", name);
  } else if (firstName) {
    result = result.replaceAll("{name}", firstName);
  }
  return result;
}

function cleanString(val: unknown): string {
  return typeof val === "string" ? val.trim() : "";
}

/** Leest en valideert de 'home.slogans' Setting Json waarde veilig in. */
export function readSlogansSetting(raw: unknown): SlogansConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return DEFAULT_SLOGANS_CONFIG;
  }

  const obj = raw as Record<string, unknown>;

  const items: SloganItem[] = Array.isArray(obj.items)
    ? obj.items.flatMap((item, idx): SloganItem[] => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const it = item as Record<string, unknown>;
        const titleNl = cleanString(it.titleNl);
        const accentNl = cleanString(it.accentNl);
        const tailNl = cleanString(it.tailNl);
        const titleEn = cleanString(it.titleEn);
        const accentEn = cleanString(it.accentEn);
        const tailEn = cleanString(it.tailEn);
        const id = cleanString(it.id) || `slogan-${idx + 1}`;

        // Minstens één van de velden moet ingevuld zijn om een geldige slogan te zijn
        if (!titleNl && !accentNl && !tailNl && !titleEn && !accentEn && !tailEn) {
          return [];
        }

        return [
          {
            id,
            titleNl,
            accentNl,
            tailNl: tailNl || undefined,
            titleEn: titleEn || undefined,
            accentEn: accentEn || undefined,
            tailEn: tailEn || undefined,
          },
        ];
      })
    : DEFAULT_SLOGAN_ITEMS;

  let personal: PersonalSlogan | null = null;
  if (obj.personal && typeof obj.personal === "object" && !Array.isArray(obj.personal)) {
    const p = obj.personal as Record<string, unknown>;
    const chanceRaw = Number(p.chancePercent);
    const chancePercent =
      Number.isFinite(chanceRaw) && chanceRaw >= 0 && chanceRaw <= 100
        ? Math.round(chanceRaw)
        : 50;

    personal = {
      enabled: Boolean(p.enabled),
      titleNl: cleanString(p.titleNl),
      accentNl: cleanString(p.accentNl),
      tailNl: cleanString(p.tailNl) || undefined,
      titleEn: cleanString(p.titleEn) || undefined,
      accentEn: cleanString(p.accentEn) || undefined,
      tailEn: cleanString(p.tailEn) || undefined,
      chancePercent,
    };
  } else if (obj.personal === undefined) {
    personal = DEFAULT_PERSONAL_SLOGAN;
  }

  const intervalSeconds =
    typeof obj.intervalSeconds === "number" && Number.isFinite(obj.intervalSeconds)
      ? Math.max(0, Math.min(60, Math.round(obj.intervalSeconds)))
      : DEFAULT_SLOGANS_CONFIG.intervalSeconds;

  const randomizeOnReload =
    typeof obj.randomizeOnReload === "boolean"
      ? obj.randomizeOnReload
      : DEFAULT_SLOGANS_CONFIG.randomizeOnReload;

  return {
    items: items.length > 0 ? items : DEFAULT_SLOGAN_ITEMS,
    personal,
    intervalSeconds,
    randomizeOnReload,
  };
}

/**
 * Zet de configuratie om in een array van DisplaySlogans voor de huidige bezoeker en taal.
 */
export function resolveDisplaySlogans({
  config,
  locale,
  user,
  fallback,
}: {
  config: SlogansConfig | null | undefined;
  locale: Locale;
  user?: { name: string; firstName: string | null } | null;
  fallback?: { title?: string; accent?: string; tail?: string };
}): DisplaySlogan[] {
  const isNl = locale === "nl";
  const cfg = config ?? DEFAULT_SLOGANS_CONFIG;
  const result: DisplaySlogan[] = [];

  // Persoonlijke slogan voor ingelogde leden (indien geactiveerd en ingelogd)
  if (user && cfg.personal?.enabled) {
    const p = cfg.personal;
    const rawTitle = isNl ? p.titleNl : p.titleEn || p.titleNl;
    const rawAccent = isNl ? p.accentNl : p.accentEn || p.accentNl;
    const rawTail = isNl ? p.tailNl : p.tailEn || p.tailNl;

    const title = interpolateName(rawTitle, user.name, user.firstName);
    const accent = interpolateName(rawAccent, user.name, user.firstName);
    const tail = interpolateName(rawTail, user.name, user.firstName);

    if (title || accent || tail) {
      result.push({
        id: "personal",
        title,
        accent,
        tail,
        isPersonal: true,
      });
    }
  }

  // Reguliere slogans
  for (const item of cfg.items) {
    const rawTitle = isNl ? item.titleNl : item.titleEn || item.titleNl;
    const rawAccent = isNl ? item.accentNl : item.accentEn || item.accentNl;
    const rawTail = isNl ? item.tailNl : item.tailEn || item.tailNl;

    // Placeholders in reguliere slogans vervangen indien ingelogd
    const title = user
      ? interpolateName(rawTitle, user.name, user.firstName)
      : rawTitle;
    const accent = user
      ? interpolateName(rawAccent, user.name, user.firstName)
      : rawAccent;
    const tail = user
      ? interpolateName(rawTail, user.name, user.firstName)
      : (rawTail ?? "");

    if (title || accent || tail) {
      result.push({
        id: item.id,
        title,
        accent,
        tail,
      });
    }
  }

  // Als er om welke reden dan ook geen slogans zijn, val terug op fallback of default
  if (result.length === 0) {
    result.push({
      id: "fallback",
      title: fallback?.title ?? (isNl ? "Ingenieurs zijn" : "Engineers are"),
      accent: fallback?.accent ?? (isNl ? "superieur." : "superior."),
      tail: fallback?.tail ?? "",
    });
  }

  return result;
}

/**
 * Bepaalt welke slogan als eerste getoond wordt bij het laden/herladen van de pagina.
 * Als de bezoeker ingelogd is en een persoonlijke slogan heeft, geldt het kanspercentage
 * (standaard 50% persoonlijke slogan, 50% kans op een willekeurige roterende slogan).
 */
export function pickInitialSloganIndex({
  displaySlogans,
  slogansConfig,
  now,
}: {
  displaySlogans: DisplaySlogan[];
  slogansConfig: SlogansConfig | null | undefined;
  now: Date;
}): number {
  if (displaySlogans.length <= 1) return 0;

  const hasPersonal = displaySlogans[0]?.isPersonal;
  if (hasPersonal && displaySlogans.length > 1) {
    const chance = slogansConfig?.personal?.chancePercent ?? 50;
    // Determinisch getal tussen 0 en 99 uit milliseconden, seconden en minuten van 'now'
    const seed =
      Math.abs(now.getSeconds() * 1000 + now.getMilliseconds() + now.getMinutes() * 7) % 100;
    if (seed < chance) {
      return 0; // Persoonlijke slogan
    }
    // Anders: kies een van de reguliere roterende slogans (index 1 t.e.m. displaySlogans.length - 1)
    const rollingCount = displaySlogans.length - 1;
    const rollingOffset =
      Math.abs(Math.floor(seed / 7) + now.getSeconds() + now.getMinutes()) % rollingCount;
    return 1 + rollingOffset;
  }

  if (slogansConfig?.randomizeOnReload) {
    return (now.getSeconds() + now.getMinutes()) % displaySlogans.length;
  }

  return 0;
}
