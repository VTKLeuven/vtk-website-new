import Image from 'next/image';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { prisma } from '@vtk/db';
import { getDictionary, pick, type Locale } from '@vtk/i18n';
import { entryForDate, isClosedHours } from '@/components/editorial/hoursUtils';
import { getVisibleHeaderTabsForNav } from '@/lib/headerTabs';
import { getCurrentSession } from '@/lib/session';
import { hasPermission } from '@vtk/auth';
import { hasPendingMeetingNotice } from '@/lib/meetings-server';
import { postAdminLinks } from '@/lib/postAdminLinks';
import { umamiEvent } from '@/lib/analytics';
import { EditorialNavLinks } from './EditorialNavLinks';
import { LocaleSwitcher } from './LocaleSwitcher';
import { ProfileMenu } from './ProfileMenu';
import { SiteHeaderShell } from './SiteHeaderShell';
import { SiteSearchForm } from './SiteSearchForm';

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
    getVisibleHeaderTabsForNav(),
    getCurrentSession(),
    prisma.setting.findUnique({ where: { key: 'home.openingHours.theokot' } }),
  ]);
  const dict = getDictionary(locale);
  const base = locale === 'nl' ? '' : '/en';
  const loginLabel = dict.header.login;

  // De grocomeet-ingang hangt in het profielmenu en niet in de navigatie: ze
  // geldt maar voor de postverantwoordelijken en Groep 5. De stip erbij verschijnt
  // enkel wanneer een reservatie ongeldig werd en er opnieuw gekozen moet worden.
  const canReserveGrocomeet = hasPermission(session, 'grocomeet.reserve');
  const grocomeetNeedsAttention = canReserveGrocomeet
    ? await hasPendingMeetingNotice(session!.user.id, now)
    : false;

  const theokot = theokotRow?.value as OpeningHoursSetting | undefined;
  const theoToday = theokot ? entryForDate(theokot.entries, now, locale) : undefined;
  const utilLeft =
    theoToday && !isClosedHours(theoToday.hours)
      ? `${pick(theokot!.titleNl, theokot!.titleEn, locale).replace(/^Openingsuren\s+/i, '')} · ${theoToday.hours}`
      : locale === 'nl'
        ? 'Theokot · zie openingsuren'
        : 'Theokot · see opening hours';

  const nl = locale === 'nl';
  const quick = nl
    ? [
        { href: `${base}/theokot`, label: 'Theokot', as: 'link' as const },
        { href: `${base}/cursusdienst`, label: 'Cursusdienst', as: 'link' as const },
        { href: `${base}/tickets`, label: 'Tickets', as: 'link' as const },
      ]
    : [
        { href: `${base}/theokot`, label: 'Theokot', as: 'link' as const },
        { href: `${base}/cursusdienst`, label: 'Course shop', as: 'link' as const },
        { href: `${base}/tickets`, label: 'Tickets', as: 'link' as const },
      ];

  return (
    <SiteHeaderShell>
      <div className="utility">
        <div className="utility-inner">
          <Link href={`${base}/theokot`} className="flex items-center gap-1.5" {...umamiEvent("openingsuren-bekeken")}>
            <span className="dot" />
            {utilLeft}
          </Link>
          <div className="utility-links">
            {quick.map((item, i) =>
              item.as === 'link' ? (
                <Link
                  key={i}
                  href={item.href}
                  {...umamiEvent(
                    item.href.includes("cursusdienst")
                      ? "cudi-webshop-geklikt"
                      : item.href.includes("theokot")
                        ? "openingsuren-bekeken"
                        : "homepage-link",
                    { label: item.label }
                  )}
                >
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
          <Image
            src="/vtk-logo.png"
            alt=""
            width={1152}
            height={650}
            // Het merkteken staat op 38px hoog met een max van 190px breed (zie
            // .brand-logo-img). Zonder `sizes` leidt Next de srcset af uit de
            // `width` hierboven en haalt de browser 1152px op voor iets van 67px,
            // op elke pagina van de site.
            sizes="190px"
            className="brand-logo-img"
            priority
          />
        </Link>

        <EditorialNavLinks
          tabs={tabs}
          base={base}
          locale={locale}
          ariaLabel={locale === 'nl' ? 'Hoofdnavigatie' : 'Main navigation'}
          // Smal scherm: de tabs zijn dan één menuknop, en het zoekveld hoort in
          // datzelfde paneel.
          search={<SiteSearchForm locale={locale} />}
        />

        <div className="nav-right">
          {/* Breed scherm: een knop naar /zoeken en geen invoerveld in de balk.
              De elf tabs vullen de navigatie tot op ~40px na, en `.nav-inner`
              stopt met groeien op --max (1320px), dus er komt geen ruimte bij op
              een breder scherm. Een veld ernaast zou de tabs eroverheen duwen.
              Op /zoeken staat de cursor meteen in het veld. */}
          <Link
            href={`${base}/zoeken`}
            aria-label={dict.search.title}
            title={dict.search.title}
            className="nav-search"
          >
            <Search aria-hidden="true" size={18} />
          </Link>
          <LocaleSwitcher locale={locale} variant="editorial" />
          {session ? (
            <ProfileMenu
              name={session.user.name}
              isAdmin={session.user.isSuperAdmin || session.permissions.length > 0}
              tools={postAdminLinks(session)}
              canReserveGrocomeet={canReserveGrocomeet}
              grocomeetNeedsAttention={grocomeetNeedsAttention}
              labels={{
                myAccount: dict.header.myAccount,
                admin: dict.header.admin,
                grocomeet: dict.header.grocomeet,
                grocomeetAttention: dict.header.grocomeetAttention,
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
    </SiteHeaderShell>
  );
}
