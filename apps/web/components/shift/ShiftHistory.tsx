import type { ReactNode } from 'react';
import { Check, MapPin, Ticket } from 'lucide-react';
import Link from '@/components/ui/Link';
import { getDictionary, type Locale } from '@vtk/i18n';
import { formatWorkingYear } from '@/lib/workingYear';
import { PRESALE_SHIFT_THRESHOLD } from '@/lib/ticketing/presale';
import { SHIFT_TIERS, shiftLadderPosition } from '@/lib/shift/tiers';
import type { HistoryYear } from '@/lib/shift/history';
import { RewardCoins } from './RewardCoins';

import './shift-history.css';

const TIMEZONE = 'Europe/Brussels';

function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

/**
 * /shift/history als titelladder: je titel groot bovenaan, de ladder van 3 tot
 * 50 shiften met waar jij staat, daaronder je posten en elk jaar, en onderaan de
 * shiften zelf. Drie andere richtingen (een logboek zoals /shift, een
 * jaarkalender en een bonnetjesafschrift) zijn bekeken; zie "Mijn
 * shiftgeschiedenis" in `docs/design-decisions.md`.
 *
 * Alles staat serverkant: een ander jaar is een link (`?jaar=`), en de lijst met
 * shiften is een gewone `<details>`, open voor het lopende jaar en dicht voor
 * een voorbij jaar.
 */
export function ShiftHistory({
  locale,
  base,
  years,
  selected,
  currentYear,
  inPraesidiumNow,
  postNames,
}: {
  locale: Locale;
  base: string;
  /** Nieuwste eerst; het lopende jaar staat er altijd in. */
  years: HistoryYear[];
  selected: HistoryYear;
  currentYear: number;
  /** Zit nu in een praesidiumpost, en dus al in de voorverkoop. */
  inPraesidiumNow: boolean;
  postNames: Record<string, string>;
}) {
  const dict = getDictionary(locale).shift;
  const t = dict.history;
  const nl = locale === 'nl';
  const intl = nl ? 'nl-BE' : 'en-GB';
  const tierName = (tier: { nl: string; en: string }) => (nl ? tier.nl : tier.en);
  const shiftCount = (n: number) => (n === 1 ? dict.day.shiftsOne : fill(dict.day.shifts, { n }));
  const voucherLabel = (n: number) => (n === 1 ? dict.reward.one : fill(dict.reward.many, { n }));
  const postName = (post: string | null) => (post ? (postNames[post] ?? post) : t.noPost);
  const yearHref = (year: number) =>
    year === currentYear ? `${base}/shift/history` : `${base}/shift/history?jaar=${year}`;

  const isCurrent = selected.year === currentYear;
  const { count, next, tier } = selected;
  const label = formatWorkingYear(selected.year);
  const position = shiftLadderPosition(count);

  // De zin onder de titel: hoeveel, en wat er nog komt. Voor een voorbij jaar
  // enkel het aantal; daar valt niets meer te halen.
  const lede: string[] = [
    isCurrent ? fill(t.thisYear, { shifts: shiftCount(count) }) : fill(t.inYear, { shifts: shiftCount(count), year: label }),
  ];
  if (isCurrent) {
    if (!next) lede.push(t.top);
    else {
      const unlocksPresale = next.min === PRESALE_SHIFT_THRESHOLD && !inPraesidiumNow;
      lede.push(fill(unlocksPresale ? t.toNextPresale : t.toNext, { left: shiftCount(next.min - count), tier: tierName(next) }));
    }
    if (inPraesidiumNow) lede.push(t.praesidiumPresale);
    else if (count >= PRESALE_SHIFT_THRESHOLD) lede.push(t.inPresale);
  }

  const ascending = [...SHIFT_TIERS].reverse();
  const youRow = (
    <li key="you" className="vtk-history-you-row" aria-hidden="true">
      <span className="vtk-history-node" />
      <span className="vtk-history-you-pill">
        {t.you}: {shiftCount(count)}
      </span>
    </li>
  );
  const ladder: ReactNode[] = [];
  let placedYou = false;
  for (const step of ascending) {
    if (!placedYou && step.min > count) {
      ladder.push(youRow);
      placedYou = true;
    }
    const state = count >= step.min ? 'done' : next?.min === step.min ? 'next' : 'todo';
    ladder.push(
      <li key={step.min} data-state={state}>
        <span className="vtk-history-node">{state === 'done' ? <Check aria-hidden="true" /> : null}</span>
        <span className="vtk-history-step-n">{step.min}</span>
        <span className="vtk-history-step-name">
          {tierName(step)}
          {state === 'done' ? <span className="sr-only">, {t.reached}</span> : null}
        </span>
        {isCurrent && step.min === PRESALE_SHIFT_THRESHOLD ? (
          <span className="vtk-history-presale">
            <Ticket aria-hidden="true" />
            {t.presale}
          </span>
        ) : null}
      </li>,
    );
  }
  if (!placedYou) ladder.push(youRow);

  const maxPerPost = selected.perPost[0]?.count ?? 1;
  const day = new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'short', timeZone: TIMEZONE });
  const time = new Intl.DateTimeFormat(intl, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TIMEZONE });

  return (
    <div className="vtk-history">
      {years.length > 1 ? (
        <nav className="vtk-shift-chips" aria-label={t.years}>
          {years.map((year) => (
            <Link
              key={year.year}
              href={yearHref(year.year)}
              className="vtk-shift-chip"
              aria-current={year.year === selected.year ? 'true' : undefined}
            >
              {formatWorkingYear(year.year)} <span className="vtk-shift-chip-count">{year.count}</span>
            </Link>
          ))}
        </nav>
      ) : null}

      <section className="vtk-history-hero" aria-labelledby="vtk-history-tier">
        <div className="vtk-history-hero-top">
          <div>
            <p className="vtk-history-eyebrow">
              {fill(t.year, { year: label })}
              {selected.deducted > 0
                ? ` · ${selected.deducted === 1 ? t.deductedOne : fill(t.deductedMany, { n: selected.deducted })}`
                : null}
            </p>
            <h2 id="vtk-history-tier" className="vtk-history-tier" data-empty={tier ? undefined : 'true'}>
              {tier ? tierName(tier) : t.noTier}
            </h2>
            <p className="vtk-history-lede">{lede.join(' ')}</p>
          </div>
          <div className="vtk-history-earned">
            <RewardCoins amount={selected.vouchers} label={voucherLabel(selected.vouchers)} size="lg" />
            <small>{selected.praesidium ? t.vouchersPraesidium : t.vouchersEarned}</small>
          </div>
        </div>

        <div className="vtk-history-ladder-wrap">
          <span className="vtk-history-ladder-fill" style={{ width: `${position}%` }} aria-hidden="true" />
          <span className="vtk-history-ladder-you" style={{ left: `max(30px, ${position}%)` }} aria-hidden="true">
            {t.you} · {count}
          </span>
          <ol className="vtk-history-ladder" aria-label={t.ladder}>
            {ladder}
          </ol>
        </div>
      </section>

      <div className="vtk-history-cols">
        <section aria-labelledby="vtk-history-posts">
          <h2 id="vtk-history-posts" className="vtk-history-h">
            {t.perPost}
          </h2>
          {selected.perPost.length === 0 && selected.deducted === 0 ? (
            <p className="vtk-history-empty">{t.empty}</p>
          ) : (
            <ul className="vtk-history-bars">
              {selected.perPost.map(({ post, count: n }) => (
                <li key={post ?? '-'}>
                  <span className="vtk-history-bar-name">{postName(post)}</span>
                  <span className="vtk-history-bar-track" aria-hidden="true">
                    <span style={{ width: `${(n / maxPerPost) * 100}%` }} />
                  </span>
                  <b>{n}</b>
                </li>
              ))}
              {selected.deducted > 0 ? (
                <li data-deducted="true">
                  <span className="vtk-history-bar-name">{t.deducted}</span>
                  <span aria-hidden="true" />
                  <b>&minus;{selected.deducted}</b>
                </li>
              ) : null}
            </ul>
          )}
        </section>

        <section aria-labelledby="vtk-history-years">
          <h2 id="vtk-history-years" className="vtk-history-h">
            {t.perYear}
          </h2>
          <table className="vtk-history-table">
            <thead>
              <tr>
                <th scope="col">{t.colYear}</th>
                <th scope="col" className="vtk-history-num">
                  {t.colShifts}
                </th>
                <th scope="col">{t.colTier}</th>
                <th scope="col" className="vtk-history-num">
                  {t.colVouchers}
                </th>
              </tr>
            </thead>
            <tbody>
              {years.map((year) => (
                <tr key={year.year} aria-current={year.year === selected.year ? 'true' : undefined}>
                  <td>
                    {years.length > 1 ? (
                      <Link href={yearHref(year.year)}>{formatWorkingYear(year.year)}</Link>
                    ) : (
                      formatWorkingYear(year.year)
                    )}
                  </td>
                  <td className="vtk-history-num">{year.count}</td>
                  <td>{year.tier ? tierName(year.tier) : '–'}</td>
                  <td className="vtk-history-num">{year.vouchers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {selected.shifts.length > 0 ? (
        // `key` per jaar: anders houdt React de open/dicht-stand van het vorige
        // jaar vast wanneer je via de chips wisselt.
        <details key={selected.year} className="vtk-history-all" open={isCurrent}>
          <summary>{fill(t.all, { shifts: shiftCount(selected.shifts.length), year: label })}</summary>
          <ul className="vtk-history-list">
            {selected.shifts.map((shift) => (
              <li key={shift.id} className="vtk-history-row">
                <span className="vtk-history-when">
                  <b>{day.format(shift.startTime)}</b>
                  <span>
                    {time.format(shift.startTime)}–{time.format(shift.endTime)}
                  </span>
                </span>
                <span className="vtk-history-what">
                  <span className="vtk-history-name">{shift.name}</span>
                  <span className="vtk-history-meta">
                    <span className="vtk-shift-post">{postName(shift.post)}</span>
                    {shift.location ? (
                      <span className="vtk-history-loc">
                        <MapPin aria-hidden="true" />
                        {shift.location}
                      </span>
                    ) : null}
                  </span>
                </span>
                {shift.earned > 0 ? (
                  <RewardCoins amount={shift.earned} label={voucherLabel(shift.earned)} />
                ) : selected.praesidium && shift.reward > 0 ? (
                  <span className="vtk-history-none">{t.noVouchers}</span>
                ) : (
                  <span />
                )}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
