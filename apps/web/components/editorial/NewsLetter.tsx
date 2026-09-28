"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * De tekst van het uitgelichte bericht, ingekort tot een vast aantal regels met
 * een zachte uitloop, en een knop die ze ter plekke openklapt.
 *
 * Het woordje van de praeses is geschreven voor het Bakske (een halve A5), dus
 * de kaart toont het begin en de rest komt op vraag. Past de tekst gewoon, dan
 * valt de knop weg: een knop die niets toevoegt, is ruis. De tekst zelf wordt op
 * de server gerenderd en komt hier als `children` binnen.
 */
export function NewsLetter({
  lines,
  labels,
  children,
}: {
  lines: number;
  labels: { more: string; less: string };
  children: ReactNode;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // Standaard mét knop: zonder JavaScript of voor de meting blijft de tekst zo
  // tenminste niet stil afgekapt zonder dat iets zegt dat er meer is.
  const [overflows, setOverflows] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      if (el.dataset.clamped !== "true") return;
      setOverflows(el.scrollHeight > el.clientHeight + 2);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const clamped = !open && overflows;

  return (
    <>
      <div
        ref={ref}
        id={id}
        className="news-letter"
        data-clamped={clamped ? "true" : "false"}
        style={{ "--news-lines": lines } as React.CSSProperties}
      >
        {children}
      </div>
      {overflows ? (
        <button
          type="button"
          className="news-more"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? labels.less : labels.more}
          <ChevronDown size={15} aria-hidden="true" />
        </button>
      ) : null}
    </>
  );
}
