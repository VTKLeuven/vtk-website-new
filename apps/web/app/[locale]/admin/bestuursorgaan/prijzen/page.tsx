import { notFound } from 'next/navigation';
import type { Prisma } from '@prisma/client';
import type { Locale } from '@vtk/i18n';
import { prisma } from '@vtk/db';
import Link from '@/components/ui/Link';
import { hasLocale } from '@/lib/locale';
import { requirePermission } from '@/lib/session';
import { getBudgetSettings } from '@/lib/bo/budget/server';
import { nextMeetingDate } from '@/lib/bo/budget/priceRound';
import { priceBrowserStatus } from '@/lib/priceCheck/fetch';
import { PRICE_LOG_DAYS, PRICE_LOG_TRIGGERS, prunePriceLog } from '@/lib/priceCheck/log';
import { SHOPS, type ShopId } from '@/lib/priceCheck/shops';
import { money, shortDate } from '@/components/bo-budget/format';

/*
 * /admin/bestuursorgaan/prijzen: het logboek van de prijscontroles bij de
 * webshops (`BoPriceCheckLog`). Bovenaan hoe het nu staat (de prijsbrowser,
 * de laatste ronde van de worker, het eerstvolgende BO), daaronder per winkel
 * de laatste 24 uur, en dan elke opvraging, nieuwste eerst. Alles staat in de
 * URL, zodat een budget zijn eigen controles kan linken (`?budget=<id>`).
 * Enkel Groep 5, zoals de instellingen.
 */

const PAGE_SIZE = 100;
const STATUSES = ['found', 'notfound', 'failed'] as const;

type Search = { budget?: string; shop?: string; status?: string; trigger?: string; page?: string };

const TRIGGER_LABEL: Record<string, [string, string]> = {
  ronde: ['Ronde om de vier uur', 'Four-hourly round'],
  openen: ['Budget geopend', 'Budget opened'],
  'nieuwe link': ['Nieuwe link', 'New link'],
  nakijken: ['Eén regel nagekeken', 'One row checked'],
  knop: ['Prijzen opnieuw ophalen', 'Fetch prices again'],
  test: ['Test bij de instellingen', 'Test in the settings'],
};

const STATUS_LABEL: Record<string, [string, string]> = {
  found: ['Prijs gevonden', 'Price found'],
  notfound: ['Niet gevonden', 'Not found'],
  failed: ['Geen antwoord', 'No answer'],
};

function shopName(id: string): string {
  return id in SHOPS ? SHOPS[id as ShopId].name : id;
}

export default async function PriceLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Search>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === 'nl';
  const base = nl ? '' : '/en';
  await requirePermission('bestuursorgaan.manage');
  await prunePriceLog().catch(() => 0);

  const sp = await searchParams;
  const budget = (sp.budget ?? '').trim().slice(0, 40);
  const shop = sp.shop && sp.shop in SHOPS ? sp.shop : '';
  const status = (STATUSES as readonly string[]).includes(sp.status ?? '') ? (sp.status as string) : '';
  const trigger = (PRICE_LOG_TRIGGERS as readonly string[]).includes(sp.trigger ?? '') ? (sp.trigger as string) : '';
  const page = Math.max(1, Number(sp.page) || 1);

  const where: Prisma.BoPriceCheckLogWhereInput = {
    ...(budget ? { budgetId: budget } : {}),
    ...(shop ? { shop } : {}),
    ...(status ? { status } : {}),
    ...(trigger ? { trigger } : {}),
  };
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 86_400_000);

  const [total, rows, perShop, lastRound, budgets, settings, browser, meeting] = await Promise.all([
    prisma.boPriceCheckLog.count({ where }),
    prisma.boPriceCheckLog.findMany({
      where,
      orderBy: { at: 'desc' },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.boPriceCheckLog.groupBy({
      by: ['shop', 'status'],
      where: { at: { gte: dayAgo }, cached: false },
      _count: { _all: true },
      _avg: { durationMs: true },
    }),
    prisma.boPriceCheckLog.findFirst({ where: { trigger: 'ronde' }, orderBy: { at: 'desc' }, select: { at: true } }),
    // De budgetten in het logboek, voor de keuzelijst; met de naam van hun laatste controle.
    prisma.boPriceCheckLog.groupBy({
      by: ['budgetId', 'budgetName'],
      where: { budgetId: { not: null } },
      _max: { at: true },
    }),
    getBudgetSettings(),
    priceBrowserStatus(),
    nextMeetingDate(),
  ]);

  const fmt = new Intl.DateTimeFormat(nl ? 'nl-BE' : 'en-GB', {
    timeZone: 'Europe/Brussels',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const budgetOptions = [
    ...new Map(
      budgets
        .filter((b): b is typeof b & { budgetId: string } => !!b.budgetId)
        .sort((a, b) => (b._max.at?.getTime() ?? 0) - (a._max.at?.getTime() ?? 0))
        .map((b) => [b.budgetId, b.budgetName ?? b.budgetId])
    ),
  ];
  const budgetName = budget ? (budgetOptions.find(([id]) => id === budget)?.[1] ?? budget) : null;

  const shops = [...new Set(perShop.map((r) => r.shop))].sort((a, b) => shopName(a).localeCompare(shopName(b)));
  const shopRow = (id: string) => {
    const of = perShop.filter((r) => r.shop === id);
    const count = (s: string) => of.find((r) => r.status === s)?._count._all ?? 0;
    const all = of.reduce((n, r) => n + r._count._all, 0);
    const avg = all ? of.reduce((n, r) => n + (r._avg.durationMs ?? 0) * r._count._all, 0) / all : 0;
    return { all, found: count('found'), notfound: count('notfound'), failed: count('failed'), avg };
  };
  const lastFailures = await prisma.boPriceCheckLog.findMany({
    where: { shop: { in: shops }, status: 'failed', at: { gte: dayAgo } },
    orderBy: { at: 'desc' },
    distinct: ['shop'],
    select: { shop: true, reason: true },
  });

  const path = `${base}/admin/bestuursorgaan/prijzen`;
  const buildHref = (patch: Partial<Search>) => {
    const next = new URLSearchParams();
    const current: Search = {
      budget: budget || undefined,
      shop: shop || undefined,
      status: status || undefined,
      trigger: trigger || undefined,
      page: page > 1 ? String(page) : undefined,
      ...patch,
    };
    for (const [key, value] of Object.entries(current)) if (value) next.set(key, value);
    const qs = next.toString();
    return `${path}${qs ? `?${qs}` : ''}`;
  };
  const filtered = Boolean(budget || shop || status || trigger);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const fieldClass = 'w-full rounded-xl border border-vtk-blue/20 bg-white px-3 py-2 text-sm text-vtk-ink';
  const labelClass = 'mb-1 block text-xs font-medium text-[#5c667f]';

  return (
    <div className="space-y-6">
      <Link href={`${base}/admin/bestuursorgaan/instellingen`} className="vtk-bud-back">
        ← {nl ? 'Instellingen voor budgetten' : 'Budget settings'}
      </Link>
      <header>
        <h1 className="text-2xl font-semibold">{nl ? 'Prijscontroles' : 'Price checks'}</h1>
        <p className="mt-1 max-w-3xl text-sm">
          {nl
            ? `Elke keer dat de site een prijs bij een webshop opvroeg voor een budget, ook wat uit het geheugen van vier uur kwam. De regels blijven ${PRICE_LOG_DAYS} dagen staan.`
            : `Every time the site asked a web shop for a price, including answers from the four-hour memory. Entries are kept for ${PRICE_LOG_DAYS} days.`}
        </p>
      </header>

      <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5" aria-labelledby="price-now">
        <h2 id="price-now" className="text-sm font-semibold text-vtk-ink">
          {nl ? 'Hoe het nu staat' : 'Current state'}
        </h2>
        <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4 border-t border-vtk-blue/10 pt-2">
            <dt className="text-[#5c667f]">{nl ? 'Prijzen nakijken' : 'Price checks'}</dt>
            <dd className={settings.collectGoLive ? 'text-vtk-ink' : 'font-medium text-vtk-danger'}>
              {settings.collectGoLive ? (nl ? 'aan' : 'on') : nl ? 'uit bij de instellingen' : 'off in the settings'}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-vtk-blue/10 pt-2">
            <dt className="text-[#5c667f]">{nl ? 'Prijsbrowser' : 'Price browser'}</dt>
            <dd className={browser === 'down' ? 'font-medium text-vtk-danger' : 'text-vtk-ink'}>
              {browser === 'up'
                ? nl
                  ? 'draait'
                  : 'running'
                : browser === 'down'
                  ? nl
                    ? 'antwoordt niet'
                    : 'not answering'
                  : nl
                    ? 'niet ingesteld'
                    : 'not configured'}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-vtk-blue/10 pt-2">
            <dt className="text-[#5c667f]">{nl ? 'Laatste ronde van de worker' : 'Last worker round'}</dt>
            <dd className="tabular-nums text-vtk-ink">
              {lastRound ? fmt.format(lastRound.at) : nl ? 'nog geen' : 'none yet'}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-vtk-blue/10 pt-2">
            <dt className="text-[#5c667f]">{nl ? 'Eerstvolgende BO' : 'Next board meeting'}</dt>
            <dd className="text-vtk-ink">
              {meeting ? shortDate(meeting, nl) : nl ? 'geen gepland in Drive' : 'none planned in Drive'}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs">
          {nl
            ? 'De worker kijkt om de vier uur de budgetten van het eerstvolgende BO na; een ander budget wanneer iemand het opent. Een ronde die niets vroeg (alles nog geen vier uur oud), staat hier niet.'
            : 'The worker checks the budgets of the next meeting every four hours; other budgets when someone opens them.'}
        </p>
      </section>

      <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5" aria-labelledby="price-shops">
        <h2 id="price-shops" className="text-sm font-semibold text-vtk-ink">
          {nl ? 'Per winkel, de laatste 24 uur' : 'Per shop, the last 24 hours'}
        </h2>
        {shops.length === 0 ? (
          <p className="mt-2 text-sm">
            {nl ? 'De laatste 24 uur vroeg de site niets aan een winkel.' : 'No shop was asked in the last 24 hours.'}
          </p>
        ) : (
          <div className="relative mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-[#5c667f]">
                  <th className="py-2 pr-3">{nl ? 'Winkel' : 'Shop'}</th>
                  <th className="py-2 pr-3 text-right">{nl ? 'Gevraagd' : 'Asked'}</th>
                  <th className="py-2 pr-3 text-right">{nl ? 'Prijs' : 'Price'}</th>
                  <th className="py-2 pr-3 text-right">{nl ? 'Niet gevonden' : 'Not found'}</th>
                  <th className="py-2 pr-3 text-right">{nl ? 'Geen antwoord' : 'No answer'}</th>
                  <th className="py-2 pr-3 text-right">{nl ? 'Gemiddeld' : 'Average'}</th>
                  <th className="py-2">{nl ? 'Laatste reden zonder antwoord' : 'Last reason without an answer'}</th>
                </tr>
              </thead>
              <tbody>
                {shops.map((id) => {
                  const r = shopRow(id);
                  return (
                    <tr key={id} className="border-t border-vtk-blue/10 align-top tabular-nums">
                      <td className="py-2 pr-3 text-vtk-ink">
                        <Link
                          href={buildHref({ shop: id, page: undefined })}
                          className="underline decoration-vtk-blue/30 underline-offset-2"
                        >
                          {shopName(id)}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-right">{r.all}</td>
                      <td className="py-2 pr-3 text-right">{r.found}</td>
                      <td className="py-2 pr-3 text-right">{r.notfound}</td>
                      <td className={`py-2 pr-3 text-right ${r.failed ? 'font-medium text-vtk-danger' : ''}`}>
                        {r.failed}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {(r.avg / 1000).toLocaleString(nl ? 'nl-BE' : 'en-GB', { maximumFractionDigits: 1 })} s
                      </td>
                      <td className="py-2 text-xs text-[#5c667f]">
                        {lastFailures.find((f) => f.shop === id)?.reason ?? ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <form
        method="get"
        action={path}
        className="grid grid-cols-1 gap-3 rounded-2xl border border-vtk-blue/12 bg-white p-5 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div>
          <label className={labelClass} htmlFor="price-budget">
            Budget
          </label>
          <select id="price-budget" name="budget" defaultValue={budget} className={fieldClass}>
            <option value="">{nl ? 'Alle budgetten' : 'All budgets'}</option>
            {budgetOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="price-shop">
            {nl ? 'Winkel' : 'Shop'}
          </label>
          <select id="price-shop" name="shop" defaultValue={shop} className={fieldClass}>
            <option value="">{nl ? 'Alle winkels' : 'All shops'}</option>
            {(Object.keys(SHOPS) as ShopId[]).map((id) => (
              <option key={id} value={id}>
                {SHOPS[id].name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="price-status">
            {nl ? 'Uitkomst' : 'Outcome'}
          </label>
          <select id="price-status" name="status" defaultValue={status} className={fieldClass}>
            <option value="">{nl ? 'Alle uitkomsten' : 'All outcomes'}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s][nl ? 0 : 1]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="price-trigger">
            {nl ? 'Waarom' : 'Why'}
          </label>
          <select id="price-trigger" name="trigger" defaultValue={trigger} className={fieldClass}>
            <option value="">{nl ? 'Alles' : 'Everything'}</option>
            {PRICE_LOG_TRIGGERS.map((t) => (
              <option key={t} value={t}>
                {TRIGGER_LABEL[t][nl ? 0 : 1]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          <button type="submit" className="rounded-full bg-vtk-ink px-4 py-2 text-sm font-medium text-white">
            {nl ? 'Filteren' : 'Filter'}
          </button>
          {filtered && (
            <Link href={path} className="rounded-full border border-vtk-blue/20 px-4 py-2 text-sm text-[#5c667f]">
              {nl ? 'Wissen' : 'Clear'}
            </Link>
          )}
        </div>
      </form>

      <section className="space-y-3 rounded-2xl border border-vtk-blue/12 bg-white p-5" aria-labelledby="price-rows">
        <h2 id="price-rows" className="text-sm font-semibold text-vtk-ink">
          {budgetName ? `${nl ? 'Controles van' : 'Checks of'} ${budgetName}` : nl ? 'Controles' : 'Checks'}{' '}
          <span className="font-normal text-[#5c667f]">
            ({total} {total === 1 ? (nl ? 'regel' : 'entry') : nl ? 'regels' : 'entries'})
          </span>
        </h2>
        {budget && (
          <p className="text-sm">
            <Link href={`${base}/admin/bestuursorgaan/mijn/${budget}`} className="vtk-bud-link">
              {nl ? 'Naar het budget' : 'Open the budget'}
            </Link>
          </p>
        )}
        {rows.length === 0 ? (
          <p className="text-sm">
            {filtered
              ? nl
                ? 'Geen controles die aan deze filter voldoen.'
                : 'No checks match this filter.'
              : nl
                ? 'Nog geen controles. Ze verschijnen zodra een budget een link naar een winkel heeft.'
                : 'No checks yet.'}
          </p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-[#5c667f]">
                  <th className="py-2 pr-3">{nl ? 'Wanneer' : 'When'}</th>
                  <th className="py-2 pr-3">{nl ? 'Waarom' : 'Why'}</th>
                  <th className="py-2 pr-3">Budget</th>
                  <th className="py-2 pr-3">{nl ? 'Winkel en product' : 'Shop and product'}</th>
                  <th className="py-2 pr-3">{nl ? 'Uitkomst' : 'Outcome'}</th>
                  <th className="py-2 pr-3 text-right">{nl ? 'Prijs' : 'Price'}</th>
                  <th className="py-2 text-right">{nl ? 'Duur' : 'Time'}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-vtk-blue/10 align-top">
                    <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-[#34405e]">{fmt.format(row.at)}</td>
                    <td className="min-w-[150px] py-2 pr-3 text-[#34405e]">
                      {TRIGGER_LABEL[row.trigger]?.[nl ? 0 : 1] ?? row.trigger}
                    </td>
                    <td className="py-2 pr-3 text-vtk-ink">
                      {row.budgetId ? (
                        <Link
                          href={buildHref({ budget: row.budgetId, page: undefined })}
                          className="underline decoration-vtk-blue/30 underline-offset-2"
                        >
                          {row.budgetName ?? row.budgetId}
                        </Link>
                      ) : (
                        <span className="text-[#5c667f]">–</span>
                      )}
                    </td>
                    <td className="max-w-[260px] py-2 pr-3">
                      <span className="text-vtk-ink">{shopName(row.shop)}</span>
                      {row.via === 'browser' && (
                        <span className="ml-1 text-xs text-[#5c667f]">({nl ? 'prijsbrowser' : 'price browser'})</span>
                      )}
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-xs text-[#5c667f] underline decoration-vtk-blue/30 underline-offset-2"
                        title={row.url}
                      >
                        {row.product ?? row.url.replace(/^https?:\/\/(www\.)?/, '')}
                      </a>
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={
                          row.status === 'found'
                            ? 'text-vtk-ink'
                            : row.status === 'failed'
                              ? 'font-medium text-vtk-danger'
                              : 'font-medium text-[#7a4e05]'
                        }
                      >
                        {STATUS_LABEL[row.status]?.[nl ? 0 : 1] ?? row.status}
                      </span>
                      {row.cached && (
                        <span className="ml-1 text-xs text-[#5c667f]">{nl ? 'uit het geheugen' : 'from memory'}</span>
                      )}
                      {row.reason && <span className="block text-xs text-[#5c667f]">{row.reason}</span>}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums text-vtk-ink">
                      {row.price != null ? `${money(row.price, nl)}${row.basis === 'excl' ? ' excl.' : ''}` : ''}
                    </td>
                    <td className="whitespace-nowrap py-2 text-right tabular-nums text-[#5c667f]">
                      {row.cached
                        ? ''
                        : `${(row.durationMs / 1000).toLocaleString(nl ? 'nl-BE' : 'en-GB', { maximumFractionDigits: 1 })} s`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-[#5c667f]">
            <span>
              {nl ? 'Pagina' : 'Page'} {page} / {totalPages}
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={buildHref({ page: String(page - 1) })}
                  className="rounded-full border border-vtk-blue/20 px-3 py-1"
                >
                  {nl ? 'Vorige' : 'Previous'}
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={buildHref({ page: String(page + 1) })}
                  className="rounded-full border border-vtk-blue/20 px-3 py-1"
                >
                  {nl ? 'Volgende' : 'Next'}
                </Link>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
