"use client";

import { useRef, useState } from "react";
import { Button, Card } from "@vtk/ui";
import type { MailPreview, MailPreviewGroup } from "@/lib/mailPreviews";

/**
 * De mails van de site, per onderdeel gegroepeerd en elk dichtgeklapt.
 *
 * Dicht bij het openen, want dit zijn er intussen een twintigtal: open zou deze
 * pagina een scrollmarathon zijn. Wat er altijd staat is waarmee je hier komt:
 * wanneer vertrekt ze, naar wie, en waar staat de template.
 *
 * De opgemaakte mails staan in een `iframe` met `sandbox`: die mail brengt haar
 * eigen html mee, en die hoort niet in de opmaak van de admin te lekken (en
 * omgekeerd). De platte mails staan in een `pre`, want dat is precies wat de
 * ontvanger ziet.
 */
export function MailPreviewList({ groups }: { groups: MailPreviewGroup[] }) {
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.id} className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-vtk-ink">{group.title}</h2>
            <p className="mt-1 text-sm text-[#5c667f]">{group.description}</p>
          </div>
          <div className="space-y-3">
            {group.mails.map((mail) => (
              <MailPreviewCard key={mail.id} mail={mail} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function MailPreviewCard({ mail }: { mail: MailPreview }) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="space-y-3 p-5" id={`mail-${mail.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl space-y-1">
          <h3 className="font-semibold text-vtk-ink">{mail.title}</h3>
          <p className="text-sm text-[#5c667f]">{mail.when}</p>
        </div>
        <Button type="button" variant="secondary" onClick={() => setOpen(!open)}>
          {open ? "Verberg de mail" : "Toon de mail"}
        </Button>
      </div>

      <dl className="grid gap-x-6 gap-y-1 text-sm text-[#34405e] sm:grid-cols-[auto_minmax(0,1fr)]">
        <dt className="text-[#5c667f]">Aan</dt>
        <dd>{mail.to}</dd>
        <dt className="text-[#5c667f]">Onderwerp</dt>
        <dd className="font-medium text-vtk-ink">{mail.subject}</dd>
        <dt className="text-[#5c667f]">Template</dt>
        <dd className="font-mono text-[13px]">{mail.file}</dd>
      </dl>

      {open ? (
        <div className="space-y-3">
          {mail.notes && mail.notes.length > 0 ? (
            <ul className="list-disc space-y-1 rounded-xl border border-vtk-blue/12 bg-vtk-blue-soft/30 p-4 pl-8 text-sm text-[#34405e]">
              {mail.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}

          {mail.html ? (
            <>
              <MailFrame title={mail.title} html={mail.html} />
              <details className="rounded-xl border border-vtk-blue/12 bg-white p-4">
                <summary className="cursor-pointer text-sm font-medium text-vtk-ink">
                  Tekstversie
                </summary>
                <MailText text={mail.text} />
              </details>
            </>
          ) : (
            <MailText text={mail.text} />
          )}
        </div>
      ) : null}
    </Card>
  );
}

/**
 * De opgemaakte mail in een eigen document, zo hoog als ze is.
 *
 * `sandbox` zonder `allow-scripts`: die mail brengt haar eigen html mee en die
 * hoort niets te kunnen uitvoeren. `allow-same-origin` staat er wel bij, en
 * enkel daarom: zonder dat krijgt het frame een eigen, ondoorzichtige oorsprong
 * en kan deze pagina zijn hoogte niet meten. Scripts blijven uit, dus het frame
 * kan er zelf niets mee.
 *
 * Zonder die meting stond er een vaste hoogte, en dan viel de knop onderaan een
 * langere mail buiten beeld.
 */
function MailFrame({ title, html }: { title: string; html: string }) {
  const frame = useRef<HTMLIFrameElement>(null);

  return (
    <iframe
      ref={frame}
      title={`Voorvertoning: ${title}`}
      srcDoc={html}
      sandbox="allow-same-origin"
      scrolling="no"
      className="w-full rounded-2xl border border-vtk-blue/15 bg-white"
      style={{ height: 640 }}
      onLoad={() => {
        const height = frame.current?.contentDocument?.documentElement?.scrollHeight;
        if (frame.current && height) frame.current.style.height = `${height + 8}px`;
      }}
    />
  );
}

/** De platte tekst zoals ze aankomt: eigen regelafbrekingen, geen opmaak. */
function MailText({ text }: { text: string }) {
  return (
    <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-xl border border-vtk-blue/12 bg-vtk-blue-soft/20 p-4 font-mono text-[13px] leading-relaxed text-[#34405e]">
      {text}
    </pre>
  );
}
