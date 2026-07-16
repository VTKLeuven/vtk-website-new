import { NextResponse } from "next/server";
import archiver from "archiver";
import { Readable } from "node:stream";
import { requirePermission, authErrorResponse } from "@/lib/session";
import { hasLocale } from "@/lib/locale";
import {
  MAILING_LISTS,
  isZipList,
  listRecipients,
  listFileName,
  toCsv,
  careerZipEntries,
  type MailingListId,
} from "@/lib/mailinglists";

function isMailingList(value: string): value is MailingListId {
  return (MAILING_LISTS as string[]).includes(value);
}

/**
 * Download van één mailinglijst: `/api/admin/mailinglijsten/<lijst>`.
 *
 * De meeste lijsten leveren één CSV; Career levert een ZIP met de opsplitsing
 * per studiejaar en per richting. De `locale`-querystring bepaalt enkel de taal
 * van de bestandsnamen, niet wie in de lijst zit.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ list: string }> }
) {
  try {
    await requirePermission("mailinglists.export");
  } catch (err) {
    return authErrorResponse(err);
  }

  const { list } = await context.params;
  if (!isMailingList(list)) {
    return new NextResponse("Unknown mailing list", { status: 404 });
  }

  const localeParam = new URL(request.url).searchParams.get("locale") ?? "nl";
  const locale = hasLocale(localeParam) ? localeParam : "nl";

  const recipients = await listRecipients(list);
  const baseName = listFileName(list, locale);

  if (!isZipList(list)) {
    return new NextResponse(toCsv(recipients), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${baseName}.csv"`,
        "cache-control": "no-store",
      },
    });
  }

  const archive = archiver("zip", { zlib: { level: 6 } });
  for (const entry of careerZipEntries(recipients, locale)) {
    archive.append(entry.content, { name: entry.name });
  }
  // Geen await: de stream wordt leeggelezen door de response.
  void archive.finalize();

  return new NextResponse(Readable.toWeb(archive) as unknown as BodyInit, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${baseName}.zip"`,
      "cache-control": "no-store",
    },
  });
}
