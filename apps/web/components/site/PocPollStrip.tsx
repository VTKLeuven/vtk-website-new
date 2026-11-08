import { cookies } from "next/headers";
import type { Locale } from "@vtk/i18n";
import { getCurrentSession } from "@/lib/session";
import { publicUrl } from "@/lib/storage";
import { nameInitials } from "@/lib/pocPolls/core";
import { pollStripCopy } from "@/lib/pocPolls/copy";
import { getOpenPocPolls, getViewerPocPolls, getViewerProgrammes } from "@/lib/pocPolls/read";
import {
  POLL_ANCHOR,
  POLL_STRIP_COOKIE,
  decidePollStrip,
  parseHiddenPolls,
} from "@/lib/pocPolls/strip";
import { PocPollStripBar } from "./PocPollStripBar";

/**
 * De gele strook onder de sitekop zolang je RiVers je iets willen vragen.
 *
 * De vragen zelf staan in de POC-band, een eind naar beneden op de homepage. Wie
 * enkel voor de kalender komt, scrolt daar nooit langs; deze strook zegt op elke
 * pagina dat er iets klaarstaat en brengt je er met één klik naartoe.
 */
export async function PocPollStrip({ locale }: { locale: Locale }) {
  const now = new Date();
  const open = await getOpenPocPolls(now);
  if (open.length === 0) return null;

  const session = await getCurrentSession();
  const [programmes, viewerPolls, cookieStore] = await Promise.all([
    session ? getViewerProgrammes(session.user.id) : Promise.resolve([]),
    session ? getViewerPocPolls(session.user.id) : Promise.resolve([]),
    cookies(),
  ]);

  const decision = decidePollStrip({
    signedIn: Boolean(session),
    programmeCount: programmes.length,
    openPollIds: open.map((poll) => poll.id),
    viewerPolls,
    hiddenPollIds: parseHiddenPolls(cookieStore.get(POLL_STRIP_COOKIE)?.value),
  });
  if (!decision) return null;

  const base = locale === "nl" ? "" : "/en";
  const anchorHref = `${base}/#${POLL_ANCHOR}`;
  const hideLabel = locale === "nl" ? "Verbergen" : "Hide";

  if (decision.kind === "poll") {
    const { poll } = decision;
    return (
      <PocPollStripBar
        pollId={poll.id}
        scope="site"
        href={anchorHref}
        jump
        copy={pollStripCopy("poll", {
          locale,
          questionCount: poll.questions.length,
          meetingDate: poll.meetingDate,
          closesAt: poll.closesAt,
          now,
        })}
        faces={poll.faces.map((face) => ({
          initials: nameInitials(face.name),
          avatarUrl: publicUrl(face.avatarKey),
        }))}
        hideLabel={hideLabel}
      />
    );
  }

  return (
    <PocPollStripBar
      pollId={decision.pollId}
      scope="home"
      href={
        decision.kind === "signIn"
          ? `${base}/inloggen?next=${encodeURIComponent(anchorHref)}`
          : `${base}/account`
      }
      jump={false}
      copy={pollStripCopy(decision.kind, { locale, now })}
      faces={[]}
      hideLabel={hideLabel}
    />
  );
}
