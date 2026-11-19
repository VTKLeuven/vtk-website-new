import type { ReactNode } from "react";
import type { Locale } from "@vtk/i18n";
import Link from "@/components/ui/Link";
import { InfoIcon, LinkIcon, LockIcon, UsersIcon } from "@/components/ui/icons";
import { sharedAlbumCopy, type SharedGateKind } from "@/lib/media-share-copy";

const ICONS: Record<SharedGateKind, () => ReactNode> = {
  login: LockIcon,
  forbidden: UsersIcon,
  gone: LinkIcon,
  unavailable: InfoIcon,
};

/**
 * Wat er in de plaats van de foto's staat wanneer een privélink niet zomaar
 * opengaat. De kaart apart, zodat /admin/it/flows precies deze kaart toont.
 */
export function SharedAlbumGateCard({
  kind,
  locale,
  loginHref,
}: {
  kind: SharedGateKind;
  locale: Locale;
  /** Enkel bij `login`: naar het inloggen, met deze link als terugweg. */
  loginHref?: string;
}) {
  const copy = sharedAlbumCopy(locale).gate;
  const text = copy[kind];
  const Icon = ICONS[kind];
  const base = locale === "nl" ? "" : "/en";

  return (
    <div className="vtk-shared-gate">
      <span className="vtk-shared-gate-icon" aria-hidden="true">
        <Icon />
      </span>
      <span className="vtk-shared-gate-kicker">{copy.kicker}</span>
      <h2>{text.title}</h2>
      <p>{text.body}</p>
      {kind === "login" && loginHref ? (
        // Een gewone link: inloggen is een andere pagina, en een prefetch daarvan
        // heeft hier geen zin.
        <a className="btn btn-primary" href={loginHref}>
          {copy.login.button}
        </a>
      ) : (
        <Link className="btn btn-ghost" href={`${base}/media`}>
          {copy.toPhotos}
        </Link>
      )}
    </div>
  );
}

/** De hele pagina: de gewone donkere kop van de site, zonder albumtitel, en de kaart. */
export function SharedAlbumGate(props: { kind: SharedGateKind; locale: Locale; loginHref?: string }) {
  const copy = sharedAlbumCopy(props.locale);
  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <div className="vtk-page-kicker">Media</div>
          <h1 className="vtk-page-title">{copy.pageTitle}</h1>
        </div>
      </header>
      <div className="vtk-page-shell">
        <SharedAlbumGateCard {...props} />
      </div>
    </div>
  );
}
