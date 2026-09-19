/**
 * De twee codemails van de 24urenloop-app: een code om de app te downloaden en
 * een code om een computer aan de app te koppelen.
 *
 * Los van het versturen, want ze vertrekken vanuit twee plaatsen (de
 * server-action van de downloadpagina en de pair-route van de app zelf) en
 * stonden daar twee keer bijna hetzelfde ingetypt. Zo toont de voorvertoning in
 * /admin/it/flows ook precies de mail die vertrekt.
 *
 * Platte tekst met één code: deze mail moet door een spamfilter raken en wordt
 * gelezen op een telefoon naast een looppiste.
 */

export type UrenloopCodeMail = { subject: string; text: string };

export function urenloopDownloadCodeMail(input: {
  code: string;
  minutes: number;
}): UrenloopCodeMail {
  return {
    subject: `Je code voor de 24urenloop-app: ${input.code}`,
    text: [
      "Hallo,",
      "",
      `Je code om de 24urenloop-app te downloaden is: ${input.code}`,
      "",
      `De code blijft ${input.minutes} minuten geldig en werkt één keer.`,
      "Vroeg je zelf geen code aan? Dan hoef je niets te doen; zonder de code gebeurt er niets.",
      "",
      "VTK Leuven",
    ].join("\n"),
  };
}

export function urenloopPairCodeMail(input: { code: string; minutes: number }): UrenloopCodeMail {
  return {
    subject: `Je code om de 24urenloop-app te koppelen: ${input.code}`,
    text: [
      "Hallo,",
      "",
      `Je code om deze computer aan de 24urenloop-app te koppelen is: ${input.code}`,
      "",
      `De code blijft ${input.minutes} minuten geldig en werkt één keer.`,
      "Koppelen zorgt dat de app zelf nieuwe versies vindt; de app werkt ook zonder.",
      "",
      "Vroeg je zelf geen code aan? Dan hoef je niets te doen.",
      "",
      "VTK Leuven",
    ].join("\n"),
  };
}
