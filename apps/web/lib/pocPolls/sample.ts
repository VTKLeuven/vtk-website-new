import { brusselsYMD, shiftYMD, ymdKey } from "@/lib/brussels";
import type { ViewerPocPoll } from "./core";

/** Een verzonnen peiling voor de voorvertoning op /admin/it/flows. */
export function samplePocPoll(now: Date): ViewerPocPoll {
  const days = 24 * 60 * 60 * 1000;
  return {
    id: "voorbeeld",
    pocId: "voorbeeld",
    titleNl: "Werkdruk en lesopnames",
    titleEn: "Workload and lecture recordings",
    meetingDate: ymdKey(shiftYMD(brusselsYMD(now), 16)),
    opensAt: new Date(now.getTime() - days).toISOString(),
    closesAt: new Date(now.getTime() + 14 * days).toISOString(),
    programmes: [],
    studyYears: [],
    faces: [],
    questions: [
      sampleQuestion("q1", "YES_NO", "Moeten lesopnames standaard online komen?", "Should lecture recordings be online by default?"),
      sampleQuestion("q2", "SCORE", "De werkdruk van dit semester is haalbaar.", "The workload this semester is manageable."),
      sampleQuestion("q3", "YES_NO", "Wil je in december een proefexamen per vak?", "Do you want a mock exam per course in December?"),
      sampleQuestion("q4", "OPEN", "Wat moet zeker op de POC aangekaart worden?", "What should definitely be raised at the POC?"),
    ],
    answered: false,
    answers: {},
  };
}

function sampleQuestion(
  id: string,
  kind: ViewerPocPoll["questions"][number]["kind"],
  textNl: string,
  textEn: string,
): ViewerPocPoll["questions"][number] {
  return { id, kind, textNl, textEn, lowLabelNl: null, lowLabelEn: null, highLabelNl: null, highLabelEn: null };
}
