import Image from "next/image";
import Link from "next/link";
import { prisma } from "@vtk/db";
import { getDictionary, pick, type Locale } from "@vtk/i18n";
import { entryForDate, isClosedHours } from "@/components/editorial/hoursUtils";
import { getSession } from "@/lib/session";
import { EditorialNavLinks } from "./EditorialNavLinks";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { ProfileMenu } from "./ProfileMenu";

type OpeningHoursSetting = {
  titleNl: string;
  titleEn: string;
  entries: Array<{ dayNl: string; dayEn: string; hours: string }>;
};

function AnonymousUserIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="8" r="3.25" />
      <path d="M6.5 19.25v-.5c0-2.35 2.02-4.25 5.5-4.25s5.5 1.9 5.5 4.25v.5" />
    </svg>
  );
}

export async function Header({ locale }: { locale: Locale }) {
  const now = new Date();
  const [tabs, session, theokotRow] = await Promise.all([
    prisma.headerTab.findMany({
      where: { visible: true },
      orderBy: { order: "asc" },
    }),
    getSession(),
    prisma.setting.findUnique({ where: { key: "home.openingHours.theokot" } }),
  ]);
  const dict = getDictionary(locale);
  const base = locale === "nl" ? "" : "/en";
  const loginLabel = dict.header.login;

  const theokot = theokotRow?.value as OpeningHoursSetting | undefined;
  const theoToday = theokot ? entryForDate(theokot.entries, now, locale) : undefined;
  const utilLeft =
    theoToday && !isClosedHours(theoToday.hours)
      ? `${pick(theokot!.titleNl, theokot!.titleEn, locale).replace(/^Openingsuren\s+/i, "")} · ${theoToday.hours}`
      : locale === "nl"
        ? "Theokot · zie openingsuren"
        : "Theokot · see opening hours";

  const nl = locale === "nl";
  const quick = nl
    ? [
        { href: `${base}/kalender`, label: "Kalender", as: "link" as const },
        { href: `${base}/cursusdienst`, label: "Tweedehands", as: "link" as const },
        { href: `${base}/cursusdienst`, label: "Boeken bestellen", as: "link" as const },
        { href: `${base}/aanbod`, label: "Theokot broodjes", as: "link" as const },
        { label: "Shiften", as: "muted" as const },
        { label: "Tijdsloten", as: "muted" as const },
      ]
    : [
        { href: `${base}/kalender`, label: "Calendar", as: "link" as const },
        { href: `${base}/cursusdienst`, label: "Second-hand", as: "link" as const },
        { href: `${base}/cursusdienst`, label: "Order books", as: "link" as const },
        { href: `${base}/aanbod`, label: "Theokot sandwiches", as: "link" as const },
        { label: "Shifts", as: "muted" as const },
        { label: "Time slots", as: "muted" as const },
      ];

  return (
    <header className="vtk-site-header">
      <div className="utility">
        <div className="utility-inner">
          <div>
            <span className="dot" />
            {utilLeft}
          </div>
          <div className="utility-links">
            {quick.map((item, i) =>
              item.as === "link" ? (
                <Link key={i} href={item.href}>
                  {item.label}
                </Link>
              ) : (
                <span key={i} className="utility-muted">
                  {item.label}
                </span>
              )
            )}
          </div>
        </div>
      </div>

      <div className="nav-inner">
        <Link href={`${base}/`} className="brand" aria-label="VTK — home">
          <span className="brand-logo-wrap">
            <Image
              src="/VTK.png"
              alt=""
              fill
              className="object-contain object-left"
              sizes="120px"
              priority
            />
          </span>
          <div className="brand-text">
            <div className="brand-name">VTK</div>
            <div className="brand-sub">EST. 1920</div>
          </div>
        </Link>

        <EditorialNavLinks
          tabs={tabs}
          base={base}
          locale={locale}
          ariaLabel={locale === "nl" ? "Hoofdnavigatie" : "Main navigation"}
        />

        <div className="nav-right">
          <LocaleSwitcher locale={locale} variant="editorial" />
          {session ? (
            <ProfileMenu
              name={session.user.name}
              isAdmin={session.user.isSuperAdmin || session.permissions.length > 0}
              labels={{
                myAccount: dict.header.myAccount,
                admin: dict.header.admin,
                logout: dict.header.logout,
              }}
              base={base}
              variant="editorial"
            />
          ) : (
            <Link
              href={`${base}/inloggen`}
              aria-label={loginLabel}
              title={loginLabel}
              className="nav-login"
            >
              <AnonymousUserIcon className="h-[1.125rem] w-[1.125rem]" />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
