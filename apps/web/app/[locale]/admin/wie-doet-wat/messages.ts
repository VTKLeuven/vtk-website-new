import type { Locale } from "@vtk/i18n";
import { saveErrorMessages } from "@/lib/saveMessages";

/** Gedeelde opslaan-meldingen, plus wat enkel bij de taakverdeling speelt. */
export function taskErrorMessages(locale: Locale): Record<string, string> {
  const nl = locale === "nl";
  return {
    ...saveErrorMessages(locale),
    TASK_NOT_FOUND: nl
      ? "Deze taak bestaat niet meer; iemand anders heeft ze net verwijderd."
      : "This task no longer exists; someone else just deleted it.",
    TASK_FORBIDDEN: nl
      ? "Niet opgeslagen: je mag enkel de taken van je eigen post verdelen."
      : "Not saved: you can only divide the tasks of your own post.",
    TASK_BACKUP_IS_HOLDER: nl
      ? "Niet opgeslagen: de backup kan niet ook verantwoordelijk zijn voor dezelfde taak."
      : "Not saved: the backup cannot also be responsible for the same task.",
    TASK_INVALID_MEMBER: nl
      ? "Niet opgeslagen: iemand die je aanduidde, zit dit werkingsjaar niet (meer) op deze post."
      : "Not saved: someone you picked is not (or no longer) on this post this working year.",
  };
}
