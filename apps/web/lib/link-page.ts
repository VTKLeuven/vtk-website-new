import { z } from "zod";
import { isEditableDestination, isSameSitePath } from "@/lib/href";

export const LINK_PAGE_SETTING_KEY = "site.linkPage";

export const SOCIAL_PLATFORMS = [
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
  "linkedin",
  "email",
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const SOCIAL_LABELS: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  email: "E-mail",
};

// De linktree staat op een andere host, dus een pad wordt bij het renderen tegen
// de site-URL opgelost (`resolveLinkHref`). Naast http(s) horen hier ook een
// mailadres en een telefoonnummer thuis: dit is de knoppenlijst uit de bio.
const linkUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((value) => isEditableDestination(value, ["mailto:", "tel:"]), {
    message: "INVALID_URL",
  });

const socialUrlSchema = z.string().trim().max(2048).refine(
  (value) => {
    if (!value) return true;
    try {
      return ["http:", "https:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  },
  { message: "INVALID_URL" },
);

export const linkPageConfigSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    description: z.string().trim().max(240),
    links: z
      .array(
        z.object({
          id: z.string().trim().min(1).max(80),
          title: z.string().trim().min(1).max(100),
          url: linkUrlSchema,
          enabled: z.boolean(),
        }),
      )
      .max(30),
    socials: z.object({
      instagram: socialUrlSchema,
      facebook: socialUrlSchema,
      tiktok: socialUrlSchema,
      youtube: socialUrlSchema,
      linkedin: socialUrlSchema,
      email: z.union([z.literal(""), z.string().trim().email().max(254)]),
    }),
  })
  .refine((config) => new Set(config.links.map((link) => link.id)).size === config.links.length, {
    message: "DUPLICATE_LINK_ID",
    path: ["links"],
  });

export type LinkPageConfig = z.infer<typeof linkPageConfigSchema>;
export type LinkPageLink = LinkPageConfig["links"][number];

export const DEFAULT_LINK_PAGE_CONFIG: LinkPageConfig = {
  title: "VTK Leuven",
  description:
    "Vlaamse Technische Kring · Studentenvereniging van de Faculteit Ingenieurswetenschappen aan KU Leuven",
  links: [
    {
      id: "website",
      title: "Website",
      url: "/",
      enabled: true,
    },
  ],
  socials: {
    instagram: "https://www.instagram.com/vtk_leuven/",
    facebook: "https://www.facebook.com/VTKLeuven",
    tiktok: "https://www.tiktok.com/@vtkleuven",
    youtube: "https://www.youtube.com/@VTKLeuven",
    linkedin: "https://www.linkedin.com/company/vtk-leuven",
    email: "info@vtk.be",
  },
};

/**
 * De publieke pagina mag nooit stukgaan door een oude of handmatig gewijzigde
 * JSON-waarde. Alleen een volledig geldige configuratie wint van de defaults.
 */
export function parseLinkPageConfig(value: unknown): LinkPageConfig {
  const parsed = linkPageConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_LINK_PAGE_CONFIG;
}

export function socialHref(platform: SocialPlatform, value: string): string {
  return platform === "email" ? `mailto:${value}` : value;
}

/**
 * Relatieve paden in de linktree (zoals `/shift` of `/`) wijzen naar de
 * hoofdsite. Los ze hier op tegen de site-URL, zodat zo'n knop ook vanaf een
 * andere host — linktree.vtk.be — naar vtk.be leidt in plaats van naar
 * linktree.vtk.be zelf te verwijzen. Absolute URL's (http(s), mailto, tel, ...)
 * blijven onveranderd.
 */
export function resolveLinkHref(url: string, baseUrl: string): string {
  if (isSameSitePath(url)) return new URL(url, baseUrl).toString();
  return url;
}
