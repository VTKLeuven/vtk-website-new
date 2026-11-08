"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, type MouseEvent } from "react";
import Link from "@/components/ui/Link";
import { ArrowDownIcon, ArrowRightIcon, CloseIcon } from "@/components/ui/icons";
import type { PollStripCopy } from "@/lib/pocPolls/copy";
import {
  POLL_ANCHOR,
  POLL_STRIP_COOKIE,
  POLL_STRIP_COOKIE_MAX_AGE,
  addHiddenPoll,
  isPollHomePath,
  pollStripFits,
  type PollStripScope,
} from "@/lib/pocPolls/strip";

export type PollStripFace = { initials: string; avatarUrl: string | null };

function readHiddenCookie(): string | undefined {
  const prefix = `${POLL_STRIP_COOKIE}=`;
  return document.cookie
    .split("; ")
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

/**
 * Op de homepage scrolt de pijl naar de vragen, elders brengt ze je ernaartoe.
 * De focus gaat mee, anders staat een toetsenbord nog bovenaan de pagina.
 */
function scrollToPoll(event: MouseEvent<HTMLAnchorElement>) {
  const target = document.getElementById(POLL_ANCHOR);
  if (!target) return;
  event.preventDefault();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  target.focus({ preventScroll: true });
}

export function PocPollStripBar({
  pollId,
  scope,
  href,
  jump,
  copy,
  faces,
  hideLabel,
  previewPlace,
}: {
  pollId: string;
  scope: PollStripScope;
  /** Waar de strook heen gaat wanneer ze niet op dezelfde pagina kan scrollen. */
  href: string;
  /** Mag ze op de homepage naar de vragen scrollen? */
  jump: boolean;
  copy: PollStripCopy;
  faces: PollStripFace[];
  hideLabel: string;
  /** Enkel in de voorvertoning: de plek die ze nabootst, zonder te navigeren. */
  previewPlace?: "home" | "away";
}) {
  const pathname = usePathname() ?? "/";
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;
  if (!previewPlace && !pollStripFits(scope, pathname)) return null;

  const onHome = previewPlace ? previewPlace === "home" : isPollHomePath(pathname);
  const scrolls = jump && onHome;

  function hide() {
    setHidden(true);
    if (previewPlace) return;
    document.cookie = `${POLL_STRIP_COOKIE}=${addHiddenPoll(readHiddenCookie(), pollId)}; path=/; max-age=${POLL_STRIP_COOKIE_MAX_AGE}; samesite=lax`;
  }

  const content = (
    <>
      {faces.length > 0 ? (
        <span className="vtk-poll-strip-faces" aria-hidden="true">
          {faces.map((face, index) => (
            <span className="vtk-poll-strip-face" key={index}>
              {face.avatarUrl ? <Image src={face.avatarUrl} alt="" width={32} height={32} /> : face.initials}
            </span>
          ))}
        </span>
      ) : null}
      <span className="vtk-poll-strip-text">
        {copy.text} <strong>{copy.strong}</strong>
      </span>
      <span className="vtk-poll-strip-action">{scrolls || !jump ? copy.action : copy.actionAway}</span>
      <span className="vtk-poll-strip-arrow" aria-hidden="true">
        {scrolls ? <ArrowDownIcon /> : <ArrowRightIcon />}
      </span>
    </>
  );

  return (
    <div className="vtk-poll-strip">
      <div className="vtk-poll-strip-inner">
        {previewPlace ? (
          <a className="vtk-poll-strip-link" href="#" onClick={(event) => event.preventDefault()}>
            {content}
          </a>
        ) : scrolls ? (
          <a className="vtk-poll-strip-link" href={`#${POLL_ANCHOR}`} onClick={scrollToPoll}>
            {content}
          </a>
        ) : (
          <Link className="vtk-poll-strip-link" href={href}>
            {content}
          </Link>
        )}
        <button type="button" className="vtk-poll-strip-hide" onClick={hide} aria-label={hideLabel} title={hideLabel}>
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}
