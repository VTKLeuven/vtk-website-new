import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import {
  EMAIL_LOG_RETENTION_DAYS,
  EMAIL_SOURCES,
  type EmailSource,
} from "@/lib/email";

const STATUS = {
  SENT: {
    nl: "Verstuurd",
    en: "Sent",
    className: "bg-emerald-100 text-emerald-800",
  },
  PARTIAL: {
    nl: "Deels geweigerd",
    en: "Partially rejected",
    className: "bg-amber-100 text-amber-900",
  },
  FAILED: { nl: "Mislukt", en: "Failed", className: "bg-red-100 text-red-800" },
  SIMULATED: {
    nl: "Lokaal gesimuleerd",
    en: "Simulated locally",
    className: "bg-zinc-100 text-zinc-700",
  },
} as const;

type AttachmentMeta = { filename: string; contentType: string | null; bytes: number };

function attachmentMetadata(value: unknown): AttachmentMeta[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.filename !== "string") return [];
    return [
      {
        filename: row.filename,
        contentType: typeof row.contentType === "string" ? row.contentType : null,
        bytes: typeof row.bytes === "number" ? row.bytes : 0,
      },
    ];
  });
}

/**
 * Toont de echte HTML, maar zonder dat een mail scripts kan uitvoeren, uit het
 * frame kan navigeren of externe pixels/afbeeldingen kan ophalen.
 */
function isolatedHtml(html: string): string {
  const policy =
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: cid:; style-src \'unsafe-inline\'; font-src data:; base-uri \'none\'; form-action \'none\'">';
  if (/<head(?:\s[^>]*)?>/i.test(html)) {
    return html.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}${policy}`);
  }
  return `<!doctype html><html><head>${policy}</head><body>${html}</body></html>`;
}

export default async function EmailLogDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: localeParam, id } = await params;
  if (!hasLocale(localeParam)) notFound();
  const nl = localeParam === "nl";
  const base = nl ? "" : "/en";

  const session = await requireSession();
  if (!session.user.isSuperAdmin) notFound();

  const now = new Date();
  const cutoff = new Date(now.getTime() - EMAIL_LOG_RETENTION_DAYS * 86_400_000);
  const row = await prisma.emailLog.findFirst({
    where: { id, createdAt: { gte: cutoff } },
  });
  if (!row) notFound();

  const dateFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    dateStyle: "long",
    timeStyle: "medium",
  });
  const bytesFmt = new Intl.NumberFormat(nl ? "nl-BE" : "en-GB", {
    style: "unit",
    unit: "kilobyte",
    unitDisplay: "short",
    maximumFractionDigits: 1,
  });
  const status = STATUS[row.status];
  const source = EMAIL_SOURCES[row.source as EmailSource];
  const attachments = attachmentMetadata(row.attachments);
  const listPath = `${base}/admin/it/email-logboek`;

  return (
    <div className="space-y-6">
      <header>
        <Link href={listPath} className="text-sm text-[#5c667f] underline decoration-vtk-blue/30 underline-offset-2">
          ← {nl ? "Terug naar het email-logboek" : "Back to the email log"}
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-semibold text-vtk-ink">{row.subject}</h1>
            <p className="mt-1 text-sm text-[#5c667f]">{dateFmt.format(row.completedAt)}</p>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${status.className}`}>
            {nl ? status.nl : status.en}
          </span>
        </div>
      </header>

      <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <h2 className="text-sm font-semibold text-vtk-ink">{nl ? "Adressering" : "Addressing"}</h2>
        <dl className="mt-4 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-[9rem_minmax(0,1fr)]">
          <dt className="text-[#5c667f]">{nl ? "Afzender" : "Sender"}</dt>
          <dd className="break-words text-vtk-ink">{row.from}</dd>
          <dt className="text-[#5c667f]">{nl ? "Aan" : "To"}</dt>
          <dd className="break-words text-vtk-ink">{row.to}</dd>
          <dt className="text-[#5c667f]">CC</dt>
          <dd className="break-words text-vtk-ink">{row.cc ?? "—"}</dd>
          <dt className="text-[#5c667f]">Reply-To</dt>
          <dd className="break-words text-vtk-ink">{row.replyTo ?? "—"}</dd>
        </dl>
      </section>

      <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <h2 className="text-sm font-semibold text-vtk-ink">
          {nl ? "Technische aflevering" : "Technical delivery"}
        </h2>
        <dl className="mt-4 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-[9rem_minmax(0,1fr)]">
          <dt className="text-[#5c667f]">{nl ? "Herkomst" : "Source"}</dt>
          <dd>{source ? (nl ? source.nl : source.en) : row.source}</dd>
          <dt className="text-[#5c667f]">{nl ? "Duur" : "Duration"}</dt>
          <dd className="tabular-nums">{row.durationMs} ms</dd>
          <dt className="text-[#5c667f]">Message-ID</dt>
          <dd className="break-all font-mono text-xs">{row.providerMessageId ?? "—"}</dd>
          <dt className="text-[#5c667f]">SMTP-response</dt>
          <dd className="break-words font-mono text-xs">{row.providerResponse ?? "—"}</dd>
          <dt className="text-[#5c667f]">{nl ? "Aanvaard" : "Accepted"}</dt>
          <dd className="break-words">{row.accepted.length ? row.accepted.join(", ") : "—"}</dd>
          <dt className="text-[#5c667f]">{nl ? "Geweigerd" : "Rejected"}</dt>
          <dd className={row.rejected.length ? "break-words text-red-700" : ""}>
            {row.rejected.length ? row.rejected.join(", ") : "—"}
          </dd>
          <dt className="text-[#5c667f]">{nl ? "Fout" : "Error"}</dt>
          <dd className={row.error ? "whitespace-pre-wrap break-words font-mono text-xs text-red-700" : ""}>
            {row.error ?? "—"}
          </dd>
        </dl>
      </section>

      {attachments.length > 0 && (
        <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
          <h2 className="text-sm font-semibold text-vtk-ink">
            {nl ? "Bijlagen" : "Attachments"} ({attachments.length})
          </h2>
          <ul className="mt-3 divide-y divide-vtk-blue/10 text-sm">
            {attachments.map((attachment, index) => (
              <li key={`${attachment.filename}-${index}`} className="flex flex-wrap justify-between gap-2 py-2">
                <span className="break-all text-vtk-ink">{attachment.filename}</span>
                <span className="text-xs text-[#5c667f]">
                  {attachment.contentType ?? (nl ? "onbekend type" : "unknown type")} · {bytesFmt.format(attachment.bytes / 1_000)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-[#5c667f]">
            {nl
              ? "Alleen naam, type en grootte worden gelogd; de bijlage zelf niet."
              : "Only the name, type and size are logged; the attachment itself is not."}
          </p>
        </section>
      )}

      <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <h2 className="text-sm font-semibold text-vtk-ink">{nl ? "Tekstversie" : "Plain-text version"}</h2>
        <pre className="mt-4 max-h-[40rem] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-[#f7f8fa] p-4 font-mono text-xs leading-5 text-[#26324a]">
          {row.text}
        </pre>
      </section>

      {row.html && (
        <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-vtk-ink">HTML-preview</h2>
            <p className="text-xs text-[#5c667f]">
              {nl
                ? "Scripts, formulieren en externe afbeeldingen zijn geblokkeerd."
                : "Scripts, forms and external images are blocked."}
            </p>
          </div>
          <iframe
            title={nl ? "Preview van de HTML-mail" : "HTML email preview"}
            sandbox=""
            srcDoc={isolatedHtml(row.html)}
            className="mt-4 h-[42rem] w-full rounded-xl border border-vtk-blue/15 bg-white"
          />
        </section>
      )}
    </div>
  );
}
