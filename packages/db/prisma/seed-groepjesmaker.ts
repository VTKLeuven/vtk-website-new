import type { FormFieldType, FormGroupingRole, PrismaClient } from "@prisma/client";

/**
 * Demo voor de groepjesmaker (Apps > Groepjesmaker): de peter-meterinschrijving
 * van onthaal, met de vragen uit hun verslag en genoeg inzendingen om een
 * indeling te zien. Zonder inzendingen toont dat scherm enkel lege panelen, en
 * lokaal zestig formulieren invullen doet niemand.
 *
 * Create-only, zoals de rest van de seed: bestaat de form al (op slug), dan
 * gebeurt er niets. Een tweede seed voegt dus geen tweede stapel inzendingen
 * toe, en wat je in het beheer wijzigde blijft staan.
 */

const FORM_SLUG = "peter-meter-groepjes";

/**
 * De volgorde is de volgorde uit het verslag van onthaal: hoe hoger de vraag,
 * hoe zwaarder ze weegt bij het indelen. De vragen die enkel gegevens ophalen
 * (naam, aantal, namen van de anderen) dragen geen gewicht maar een eigen rol.
 */
type SeedField = {
  code: string;
  type: FormFieldType;
  labelNl: string;
  labelEn: string;
  helpNl?: string;
  required?: boolean;
  options?: { code: string; labelNl: string; labelEn: string }[];
  /** Null: een vraag zonder rol, een gegeven dat niet meetelt bij het indelen. */
  role: FormGroupingRole | null;
  weight?: number;
  /** Bij ANCHOR en ACCEPTS_EXTRA: welke antwoorden "ja" betekenen. */
  roleOptions?: string[];
  /** Enkel tonen wanneer `rol` dit antwoord heeft. */
  onlyWhenRole?: string;
};

const FIELDS: SeedField[] = [
  {
    code: "rol",
    type: "SINGLE_CHOICE",
    labelNl: "Schrijf je in als peter of meter, of als petekind?",
    labelEn: "Are you signing up as a mentor or as a first-year?",
    required: true,
    options: [
      { code: "peter_meter", labelNl: "Peter of meter", labelEn: "Mentor" },
      { code: "petekind", labelNl: "Petekind (eerstejaars)", labelEn: "First-year" },
    ],
    role: "ANCHOR",
    roleOptions: ["peter_meter"],
  },
  {
    code: "voornaam",
    type: "SHORT_TEXT",
    labelNl: "Voornaam",
    labelEn: "First name",
    required: true,
    role: "NAME",
  },
  {
    code: "naam",
    type: "SHORT_TEXT",
    labelNl: "Naam",
    labelEn: "Surname",
    required: true,
    role: "NAME",
  },
  {
    code: "rnummer",
    type: "SHORT_TEXT",
    labelNl: "R-nummer",
    labelEn: "R-number",
    role: "IDENTIFIER",
  },
  {
    code: "gsm",
    type: "PHONE",
    labelNl: "Gsm-nummer",
    labelEn: "Mobile number",
    helpNl: "Zodat je peter of meter je kan bereiken voor de introductiedag.",
    required: true,
    // Geen rol: een telefoonnummer zegt niets over bij wie je past. Het staat
    // wel op de afdruklijst per groep, samen met de naam en het r-nummer.
    role: null,
  },
  {
    code: "aantal",
    type: "NUMBER",
    labelNl: "Met hoeveel schrijf je in, jezelf meegeteld?",
    labelEn: "How many people are you signing up, including yourself?",
    helpNl: "Schrijf je je alleen in, vul dan 1 in. Wie samen inschrijft, blijft samen.",
    required: true,
    role: "GROUP_SIZE",
  },
  {
    code: "metwie",
    type: "SHORT_TEXT",
    labelNl: "Met wie schrijf je in?",
    labelEn: "Who are you signing up with?",
    helpNl: "De namen van de anderen, met komma's ertussen. Laat leeg als je alleen bent.",
    role: "GROUP_NAMES",
  },
  {
    code: "nieuwe_peters",
    type: "BOOLEAN",
    labelNl: "Aanvaarden jullie nog peters of meters die zich alleen inschreven?",
    labelEn: "Do you accept mentors who signed up on their own?",
    role: "ACCEPTS_EXTRA",
    roleOptions: ["true"],
    onlyWhenRole: "peter_meter",
  },
  {
    code: "richting",
    type: "SINGLE_CHOICE",
    labelNl: "Wil jij met burgies, archies of gemengd zitten?",
    labelEn: "Do you want to be with engineers, architects or mixed?",
    required: true,
    options: [
      { code: "burgies", labelNl: "Met burgies", labelEn: "With engineers" },
      { code: "archies", labelNl: "Met archies", labelEn: "With architects" },
      { code: "gemengd", labelNl: "Gemengd", labelEn: "Mixed" },
    ],
    role: "SIMILAR",
    weight: 5,
  },
  {
    code: "uitgaan",
    type: "SINGLE_CHOICE",
    labelNl: "Wil je samen met je peter-metergroepje uitgaan?",
    labelEn: "Do you want to go out with your mentor group?",
    required: true,
    options: [
      { code: "vaak", labelNl: "Ja, en vaak", labelEn: "Yes, often" },
      { code: "afentoe", labelNl: "Af en toe", labelEn: "Now and then" },
      { code: "liever_niet", labelNl: "Liever niet", labelEn: "Rather not" },
    ],
    role: "SIMILAR",
    weight: 4,
  },
  {
    code: "studie_info",
    type: "SINGLE_CHOICE",
    labelNl: "Wil je studiegerelateerde info krijgen of geven?",
    labelEn: "Do you want to get or give study-related info?",
    required: true,
    options: [
      { code: "graag", labelNl: "Ja, graag", labelEn: "Yes, please" },
      { code: "maakt_niet_uit", labelNl: "Maakt me niet uit", labelEn: "No preference" },
      { code: "liever_niet", labelNl: "Liever niet", labelEn: "Rather not" },
    ],
    role: "SIMILAR",
    weight: 4,
  },
  {
    code: "cafe_of_fak",
    type: "SINGLE_CHOICE",
    labelNl: "Ga je graag op cafeetje, of liever naar de fak?",
    labelEn: "Do you prefer a pub or the fak?",
    required: true,
    options: [
      { code: "cafe", labelNl: "Cafeetje", labelEn: "Pub" },
      { code: "fak", labelNl: "De fak", labelEn: "The fak" },
      { code: "beide", labelNl: "Allebei even graag", labelEn: "Both, equally" },
    ],
    role: "SIMILAR",
    weight: 3,
  },
  {
    code: "afspreken",
    type: "SINGLE_CHOICE",
    labelNl: "Hoe vaak wil je idealiter afspreken met je peter-metergroep na de introductiedag?",
    labelEn: "Ideally, how often do you want to meet your mentor group after the intro day?",
    required: true,
    options: [
      { code: "wekelijks", labelNl: "Wekelijks", labelEn: "Weekly" },
      { code: "maandelijks", labelNl: "1 tot 2 keer per maand", labelEn: "Once or twice a month" },
      { code: "soms", labelNl: "Af en toe, wanneer nodig", labelEn: "Now and then, when needed" },
      {
        code: "officieel",
        labelNl: "Enkel tijdens officiële peter-meteractiviteiten",
        labelEn: "Only at official mentor activities",
      },
    ],
    role: "SIMILAR",
    weight: 2,
  },
  {
    code: "rol_peter",
    type: "SINGLE_CHOICE",
    labelNl: "Hoe zie jij de rol van je meter of peter het liefst?",
    labelEn: "How do you see the role of your mentor?",
    required: true,
    options: [
      { code: "coach", labelNl: "Coach of mentor voor de studie", labelEn: "Study coach" },
      {
        code: "gids",
        labelNl: "Gids voor het studentenleven en de stad",
        labelEn: "Guide to student life and the city",
      },
      { code: "vriend", labelNl: "Gewoon een chille vriend of vriendin", labelEn: "Just a friend" },
      { code: "maakt_niet_uit", labelNl: "Maakt niet uit", labelEn: "No preference" },
    ],
    role: "SIMILAR",
    weight: 1,
  },
];

const FIRST_NAMES = [
  "Amber", "Arne", "Babette", "Bram", "Cato", "Daan", "Eline", "Emiel", "Fien", "Gilles",
  "Hanne", "Ilias", "Jitse", "Jolien", "Kasper", "Lana", "Lars", "Lotte", "Maarten", "Marie",
  "Mathis", "Merel", "Nathan", "Nina", "Olivier", "Pauline", "Quinten", "Robbe", "Sien", "Seppe",
  "Tibo", "Tine", "Ulrike", "Vince", "Wout", "Yana", "Zoe", "Aaron", "Britt", "Cedric",
];

const SURNAMES = [
  "Aerts", "Beckers", "Claes", "De Backer", "De Smet", "Desmet", "Dewit", "Fransen", "Goossens",
  "Hermans", "Jacobs", "Janssens", "Lambrechts", "Maes", "Mertens", "Michiels", "Peeters",
  "Segers", "Smets", "Vandenberghe", "Van Damme", "Verhoeven", "Vermeulen", "Willems", "Wouters",
];

/** Mulberry32: dezelfde seed geeft dezelfde demo, ook op een verse database. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Person = { first: string; last: string; rNumber: string; phone: string };

function people(next: () => number, count: number, startNumber: number): Person[] {
  const seen = new Set<string>();
  const result: Person[] = [];
  while (result.length < count) {
    const first = FIRST_NAMES[Math.floor(next() * FIRST_NAMES.length)];
    const last = SURNAMES[Math.floor(next() * SURNAMES.length)];
    const key = `${first} ${last}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const serial = startNumber + result.length;
    result.push({
      first,
      last,
      rNumber: `r0${serial}`,
      phone: `04${String(70 + (serial % 30))} ${String(10 + (serial % 90))} ${String(
        10 + ((serial * 7) % 90)
      )} ${String(10 + ((serial * 13) % 90))}`,
    });
  }
  return result;
}

function pick(next: () => number, codes: readonly string[]): string {
  return codes[Math.floor(next() * codes.length)];
}

/**
 * Een petekind of peter/meter kiest niet willekeurig: wie met burgies wil
 * zitten, wil vaker uitgaan dan wie voor archies koos, en wie wekelijks wil
 * afspreken wil ook vaker studie-info. Zonder dat verband is elke indeling even
 * goed en zie je aan het resultaat niet of het algoritme iets doet.
 */
function answersFor(next: () => number, isAnchor: boolean): Record<string, string> {
  const richting = pick(next, ["burgies", "burgies", "burgies", "archies", "archies", "gemengd"]);
  const uitgaandType = richting === "archies" ? next() < 0.45 : next() < 0.7;
  return {
    richting,
    uitgaan: uitgaandType
      ? pick(next, ["vaak", "vaak", "afentoe"])
      : pick(next, ["afentoe", "liever_niet"]),
    studie_info: pick(next, ["graag", "graag", "maakt_niet_uit", "liever_niet"]),
    cafe_of_fak: uitgaandType
      ? pick(next, ["fak", "fak", "beide", "cafe"])
      : pick(next, ["cafe", "beide"]),
    afspreken: pick(next, ["wekelijks", "maandelijks", "maandelijks", "soms", "officieel"]),
    rol_peter: isAnchor
      ? pick(next, ["coach", "gids", "vriend", "maakt_niet_uit"])
      : pick(next, ["gids", "gids", "vriend", "coach", "maakt_niet_uit"]),
  };
}

export async function seedGroupMakerDemo(prisma: PrismaClient): Promise<void> {
  const existing = await prisma.form.findUnique({
    where: { slug: FORM_SLUG },
    select: { id: true },
  });
  if (existing) return;

  const owner =
    (await prisma.group.findUnique({ where: { code: "ONTHAAL" }, select: { id: true } })) ??
    (await prisma.group.findFirst({ select: { id: true }, orderBy: { code: "asc" } }));
  // Zonder een post om de form aan te hangen is er niets te seeden; de groepen
  // hierboven in de seed maken die normaal net aan.
  if (!owner) return;

  const now = new Date();
  const closesAt = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000);

  const form = await prisma.form.create({
    data: {
      slug: FORM_SLUG,
      ownerGroupId: owner.id,
      titleNl: "Peter-metergroepjes",
      titleEn: "Mentor groups",
      introNl:
        "Schrijf je in voor de peter-meterwerking. Op basis van je antwoorden zetten we je in een groepje dat bij je past. Wil je met vrienden in hetzelfde groepje? Schrijf dan samen in: één iemand vult het formulier in voor jullie allemaal.",
      introEn:
        "Sign up for the mentor programme. We put you in a group that fits your answers. Want to be with friends? Then sign up together: one of you fills in the form for all of you.",
      status: "PUBLISHED",
      audience: "PUBLIC",
      closesAt,
      thankYouNl:
        "Bedankt. Je hoort voor de start van het academiejaar in welk groepje je zit.",
      thankYouEn: "Thanks. You will hear which group you are in before the academic year starts.",
    },
  });

  const fieldIds = new Map<string, string>();
  for (const [index, field] of FIELDS.entries()) {
    const row = await prisma.formField.create({
      data: {
        formId: form.id,
        code: field.code,
        type: field.type,
        sortOrder: index,
        labelNl: field.labelNl,
        labelEn: field.labelEn,
        helpNl: field.helpNl ?? null,
        required: field.required ?? false,
        config: field.type === "NUMBER" ? { min: 1, max: 10 } : {},
        options: {
          // formId komt uit de samengestelde relatie met het veld.
          create: (field.options ?? []).map((option, order) => ({
            code: option.code,
            labelNl: option.labelNl,
            labelEn: option.labelEn,
            sortOrder: order,
          })),
        },
      },
    });
    fieldIds.set(field.code, row.id);
  }

  // "Aanvaarden jullie nog peters of meters?" heeft enkel betekenis voor wie
  // zich als peter of meter inschrijft.
  for (const field of FIELDS) {
    if (!field.onlyWhenRole) continue;
    await prisma.formFieldCondition.create({
      data: {
        formId: form.id,
        fieldId: fieldIds.get(field.code)!,
        sourceFieldId: fieldIds.get("rol")!,
        operator: "EQUALS",
        value: field.onlyWhenRole,
      },
    });
  }

  await prisma.formGrouping.create({
    data: {
      formId: form.id,
      // Uit het verslag: groepjes van ongeveer 14 à 15 petekinderen met 5 à 6
      // peters en meters erbij.
      minMembers: 14,
      maxMembers: 16,
      minAnchors: 4,
      maxAnchors: 6,
      autoRun: true,
      // De seed zet 83 personen klaar. Twee te weinig, met opzet: zo staat de
      // form nog open en kan je het automatisch sluiten zelf uitlokken door het
      // publieke formulier in te vullen met twee personen. Wie meteen wil zien
      // hoe de indeling eruitziet, klikt "Nu indelen".
      expectedPeople: 85,
      fields: {
        create: FIELDS.filter((field) => field.role != null).map((field) => ({
          fieldId: fieldIds.get(field.code)!,
          role: field.role!,
          weight: field.weight ?? 1,
          options: field.roleOptions ?? [],
        })),
      },
    },
  });

  const next = random(20260925);
  const kids = people(next, 60, 1000000);
  const mentors = people(next, 23, 900000);

  /** Eén inzending: de invuller, zijn antwoorden en wie hij meebrengt. */
  async function entry(
    person: Person,
    isAnchor: boolean,
    companions: Person[],
    acceptsExtra: boolean | null,
    submittedAt: Date
  ) {
    const answers = answersFor(next, isAnchor);
    // `formId` staat er bewust niet bij: bij een geneste create komt die uit de
    // samengestelde relatie met de inzending, en meegeven wordt geweigerd.
    const text = (code: string, value: string) => ({
      fieldId: fieldIds.get(code)!,
      fieldCode: code,
      valueText: value,
    });
    await prisma.formEntry.create({
      data: {
        formId: form.id,
        status: "SUBMITTED",
        submittedAt,
        submitterName: `${person.first} ${person.last}`,
        submitterEmail: `${person.first}.${person.last}`
          .toLowerCase()
          .replace(/[^a-z]+/g, ".")
          .concat("@student.prototype"),
        answers: {
          create: [
            {
              fieldId: fieldIds.get("rol")!,
              fieldCode: "rol",
              valueOptions: [isAnchor ? "peter_meter" : "petekind"],
            },
            text("voornaam", person.first),
            text("naam", person.last),
            text("rnummer", person.rNumber),
            text("gsm", person.phone),
            {
              fieldId: fieldIds.get("aantal")!,
              fieldCode: "aantal",
              valueNumber: companions.length + 1,
            },
            ...(companions.length > 0
              ? [
                  text(
                    "metwie",
                    companions.map((mate) => `${mate.first} ${mate.last}`).join(", ")
                  ),
                ]
              : []),
            ...(acceptsExtra == null
              ? []
              : [
                  {
                    fieldId: fieldIds.get("nieuwe_peters")!,
                    fieldCode: "nieuwe_peters",
                    valueBool: acceptsExtra,
                  },
                ]),
            ...Object.entries(answers).map(([code, value]) => ({
              fieldId: fieldIds.get(code)!,
              fieldCode: code,
              valueOptions: [value],
            })),
          ],
        },
      },
    });
  }

  // Elke inzending een eigen moment, zodat de lijst een geloofwaardige volgorde
  // heeft in plaats van tachtig keer hetzelfde tijdstip.
  let minutesAgo = 60 * 24 * 12;
  const moment = () => {
    minutesAgo -= 3 + Math.floor(next() * 90);
    return new Date(now.getTime() - minutesAgo * 60 * 1000);
  };

  // Drie groepen peters en meters die samen inschrijven (een ervan neemt er
  // niemand meer bij), en de rest alleen.
  const teams = [mentors.slice(0, 5), mentors.slice(5, 10), mentors.slice(10, 14)];
  for (const [index, team] of teams.entries()) {
    await entry(team[0], true, team.slice(1), index !== 1, moment());
  }
  for (const mentor of mentors.slice(14)) {
    await entry(mentor, true, [], true, moment());
  }

  // Petekinderen: de meeste alleen, en een paar groepjes vrienden die samen
  // inschrijven (twee of drie personen op één inzending).
  let index = 0;
  const friendGroups = [3, 2, 2, 3, 2];
  for (const size of friendGroups) {
    const group = kids.slice(index, index + size);
    index += size;
    await entry(group[0], false, group.slice(1), null, moment());
  }
  for (const kid of kids.slice(index)) {
    await entry(kid, false, [], null, moment());
  }
}

export const GROUP_MAKER_DEMO_SLUG = FORM_SLUG;
