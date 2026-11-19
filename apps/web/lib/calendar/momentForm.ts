import { z } from "zod";
import { isImageFieldKey } from "@/lib/imageField";
import { localDateTimeToUtc } from "@/lib/ticketing/time";
import type { MomentValue } from "@/lib/calendar/momentDraft";

/**
 * Hoeveel momenten één evenement mag dragen. Een loopweek heeft er zeven en een
 * kerstmarkt een stuk of tien; honderd is geen evenement meer maar een reeks die
 * in de kalender zelf thuishoort.
 */
const MAX_MOMENTS = 60;

/** De eigen tekst van een moment: een paar alinea's, geen pagina. */
export const MOMENT_DESCRIPTION_MAX = 20_000;

/** Eén moment zoals het formulier het meestuurt: een dag en twee uren, en wat er eigen aan is. */
const momentSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
  label: z.string().trim().max(80).optional().default(""),
  location: z.string().trim().max(300).optional().default(""),
  descriptionNl: z.string().trim().max(MOMENT_DESCRIPTION_MAX).optional().default(""),
  descriptionEn: z.string().trim().max(MOMENT_DESCRIPTION_MAX).optional().default(""),
  // Dezelfde mappen als het afbeeldingsveld van het evenement: deze waarde komt
  // uit de browser en wordt straks publiek getoond.
  imageKey: z
    .string()
    .trim()
    .max(500)
    .optional()
    .default("")
    .refine((key) => !key || isImageFieldKey(key)),
  imageFocusX: z.number().min(0).max(1).optional().default(0.5),
  imageFocusY: z.number().min(0).max(1).optional().default(0.5),
});

/** De dag na deze, als "YYYY-MM-DD". Kalenderdagen, dus via UTC gerekend. */
function nextDay(date: string): string {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/**
 * De losse momenten uit het formulier, in volgorde.
 *
 * `null` = het formulier stuurde er geen mee, dus het evenement werkt met één
 * doorlopende periode. Een lege lijst is wél een fout: dan stond het formulier in
 * de momentenmodus zonder dat er iets ingevuld was, en stil terugvallen op de
 * start en het einde van daarnet zou iets anders opslaan dan wat er op het scherm
 * stond.
 *
 * Een einduur dat niet later is dan het beginuur betekent de nacht erna: een
 * nachtloop van 22u tot 2u hoort bij de avond waarop hij vertrekt, en dat is ook
 * hoe de kalender hem indeelt.
 */
export function parseMomentsField(raw: FormDataEntryValue | null): MomentValue[] | null | "invalid" {
  if (typeof raw !== "string") return null;

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return "invalid";
  }
  const parsed = z.array(momentSchema).max(MAX_MOMENTS).safeParse(parsedJson);
  if (!parsed.success) return "invalid";

  const moments: MomentValue[] = [];
  for (const row of parsed.data) {
    try {
      const start = localDateTimeToUtc(`${row.date}T${row.start}`);
      const endDay = row.end > row.start ? row.date : nextDay(row.date);
      moments.push({
        start,
        end: localDateTimeToUtc(`${endDay}T${row.end}`),
        label: row.label || null,
        location: row.location || null,
        descriptionNl: row.descriptionNl || null,
        descriptionEn: row.descriptionEn || null,
        imageKey: row.imageKey || null,
        imageFocusX: row.imageFocusX,
        imageFocusY: row.imageFocusY,
      });
    } catch {
      return "invalid";
    }
  }
  return moments.sort((a, b) => a.start.getTime() - b.start.getTime());
}
