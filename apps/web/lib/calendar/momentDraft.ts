import { utcToLocalDateTime } from "@/lib/ticketing/time";

/**
 * Eén moment zoals het beheerformulier het bewerkt en meestuurt.
 *
 * Staat los van `momentForm.ts` omdat dit ook in de browser draait, en de parser
 * daar zod zou meeslepen.
 */

/** Eén moment zoals de database het levert. */
export type MomentValue = {
  start: Date;
  end: Date;
  label: string | null;
  location: string | null;
  descriptionNl: string | null;
  descriptionEn: string | null;
  imageKey: string | null;
  imageFocusX: number;
  imageFocusY: number;
};

/** Eén rij in de editor. Datum en uren staan los, want zo tik je ze ook in. */
export type MomentDraft = {
  date: string;
  start: string;
  end: string;
  label: string;
  location: string;
  descriptionNl: string;
  descriptionEn: string;
  imageKey: string;
  imageFocusX: number;
  imageFocusY: number;
};

/** Wat op een nieuwe rij leeg staat: alles behalve de dag en de uren volgt het evenement. */
export const EMPTY_MOMENT_DETAILS = {
  label: "",
  location: "",
  descriptionNl: "",
  descriptionEn: "",
  imageKey: "",
  imageFocusX: 0.5,
  imageFocusY: 0.5,
} satisfies Partial<MomentDraft>;

export function momentToDraft(moment: MomentValue): MomentDraft {
  const [date, start] = utcToLocalDateTime(moment.start).split("T");
  // Een moment over middernacht (een nachtloop tot 2u) draagt enkel zijn
  // startdag; de action leest een einduur dat niet later is dan het beginuur als
  // de dag erna. Zo blijft de rij twee uurvelden breed in plaats van twee datums.
  const end = utcToLocalDateTime(moment.end).split("T")[1];
  return {
    date: date ?? "",
    start: start ?? "",
    end: end ?? "",
    label: moment.label ?? "",
    location: moment.location ?? "",
    descriptionNl: moment.descriptionNl ?? "",
    descriptionEn: moment.descriptionEn ?? "",
    imageKey: moment.imageKey ?? "",
    imageFocusX: moment.imageFocusX,
    imageFocusY: moment.imageFocusY,
  };
}
