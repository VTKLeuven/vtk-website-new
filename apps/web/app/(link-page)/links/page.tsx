import { cache } from "react";
import Image from "next/image";
import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { prisma } from "@vtk/db";
import { SocialIcon } from "@/components/link-page/SocialIcon";
import {
  DEFAULT_LINK_PAGE_CONFIG,
  LINK_PAGE_SETTING_KEY,
  SOCIAL_LABELS,
  SOCIAL_PLATFORMS,
  parseLinkPageConfig,
  socialHref,
} from "@/lib/link-page";
import { DEFAULT_OG_IMAGE, siteUrl, truncateDescription } from "@/lib/seo";
import { ShareButton } from "./ShareButton";

const loadConfig = cache(async () => {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: LINK_PAGE_SETTING_KEY } });
    return parseLinkPageConfig(setting?.value);
  } catch {
    // Deze URL staat in social-media-bio's en moet ook tijdens een korte
    // databaseonderbreking bruikbaar blijven. De vaste defaults wijzen naar de
    // hoofdsite en de bestaande officiële kanalen.
    return DEFAULT_LINK_PAGE_CONFIG;
  }
});

/** Het adres onderaan de plaat; komt uit dezelfde bron als de canonical URL. */
function linkPageHost(): string {
  try {
    return new URL(siteUrl()).host;
  } catch {
    return "vtk.be";
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const config = await loadConfig();
  const description = truncateDescription(config.description || DEFAULT_LINK_PAGE_CONFIG.description);
  const url = `${siteUrl()}/links`;
  const image = `${siteUrl()}${DEFAULT_OG_IMAGE}`;

  return {
    title: config.title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      title: config.title,
      description,
      url,
      siteName: "VTK",
      locale: "nl_BE",
      images: [{ url: image, width: 1200, height: 630, alt: config.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: config.title,
      description,
      images: [image],
    },
  };
}

export default async function LinksPage() {
  const config = await loadConfig();
  const socials = SOCIAL_PLATFORMS.filter((platform) => config.socials[platform]);
  const links = config.links.filter((link) => link.enabled);

  return (
    <main className="vtk-link-page">
      <div className="vtk-link-page-pattern" aria-hidden="true" />
      <section className="vtk-link-page-shell" aria-labelledby="link-page-title">
        <ShareButton title={config.title} />

        <div className="vtk-link-page-head">
          <div className="vtk-link-page-profile">
            <Image
              src="/vtk-logo.png"
              // De titel eronder noemt de kring al; een tweede keer "VTK" laten
              // voorlezen voegt niets toe.
              alt=""
              width={1152}
              height={650}
              // Het merkteken staat op 58px hoog, dus zo'n 103px breed. Zonder
              // `sizes` haalt de browser het volledige bestand van 1152px op.
              sizes="120px"
              preload
              className="vtk-link-page-logo"
            />
            <h1 id="link-page-title" className="vtk-link-page-title">
              {config.title}
            </h1>
            {config.description ? (
              <p className="vtk-link-page-tagline">{config.description}</p>
            ) : null}
          </div>

          {socials.length > 0 ? (
            <nav className="vtk-link-page-socials" aria-label="Sociale media en contact">
              {socials.map((platform) => {
                const href = socialHref(platform, config.socials[platform]);
                const external = platform !== "email";
                return (
                  <a
                    key={platform}
                    href={href}
                    className="vtk-link-page-social"
                    aria-label={SOCIAL_LABELS[platform]}
                    title={SOCIAL_LABELS[platform]}
                    target={external ? "_blank" : undefined}
                    rel={external ? "noopener noreferrer" : undefined}
                  >
                    <SocialIcon platform={platform} />
                  </a>
                );
              })}
            </nav>
          ) : null}
        </div>

        {links.length > 0 ? (
          <ul className="vtk-link-page-links">
            {links.map((link) => {
              const external = /^https?:\/\//i.test(link.url);
              return (
                <li key={link.id}>
                  <a
                    href={link.url}
                    className="vtk-link-page-link"
                    target={external ? "_blank" : undefined}
                    rel={external ? "noopener noreferrer" : undefined}
                  >
                    <span className="vtk-link-page-link-label">{link.title}</span>
                    <ExternalLink aria-hidden="true" />
                  </a>
                </li>
              );
            })}
          </ul>
        ) : null}

        <p className="vtk-link-page-foot">{linkPageHost()}/links</p>
      </section>
    </main>
  );
}
