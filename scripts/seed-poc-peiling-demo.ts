/**
 * Zet een volledig voorbeeld van de POC-peilingen klaar, om alles lokaal te
 * bekijken: een open peiling, afgesloten peilingen met resultaten, een concept,
 * zestig studenten om de deelname mee te tellen en drie accounts om mee aan te
 * melden.
 *
 * Draaien:
 *
 *   npm run db:demo:peiling              # zet alles (opnieuw) klaar
 *   npm run db:demo:peiling -- --reset   # enkel opruimen
 *
 * Aanmelden kan met student@peiling.demo, river@peiling.demo en
 * beheer@peiling.demo (superadmin, voor /admin/it/flows), alle drie met het
 * wachtwoord uit `PASSWORD`. Na het draaien kan het tot een minuut duren voor de
 * peiling verschijnt: de open peilingen staan in de gedeelde cache.
 *
 * Wat dit script aanmaakt, herkent het aan het id (`demo-poc-peiling...`) en aan
 * het domein `@peiling.demo`. Iets anders raakt het niet aan.
 *
 * Weigert te draaien tegen iets anders dan een lokale database: dit maakt
 * accounts aan met een wachtwoord dat hieronder in de code staat.
 */

import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";
import type { PocPollQuestionKind, StudyProgramme, StudyYear } from "@prisma/client";
import { brusselsYMD, shiftYMD, ymdKey } from "../apps/web/lib/brussels";
import { currentStudyYear, currentWorkingYear } from "../apps/web/lib/workingYear";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const POLL_PREFIX = "demo-poc-peiling";
const DOMAIN = "@peiling.demo";
const PASSWORD = "peiling-demo";
const DAY = 24 * 60 * 60 * 1000;

function assertLocalDatabase(): void {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    console.error("DATABASE_URL ontbreekt. Staat je .env op zijn plaats?");
    process.exit(1);
  }
  const host = new URL(raw).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    console.error(`Weigert te draaien: DATABASE_URL wijst naar "${host}" en niet naar een lokale database.`);
    process.exit(1);
  }
}

/** Hoeveel studenten per fase er zijn, en hoeveel van hen antwoordden. */
const PHASES: Array<{ year: StudyYear; students: number; voters: number }> = [
  { year: "BACHELOR_2", students: 24, voters: 12 },
  { year: "BACHELOR_3", students: 18, voters: 8 },
  { year: "MASTER_1", students: 12, voters: 6 },
  { year: "MASTER_2", students: 6, voters: 3 },
];

type DemoQuestion = { kind: PocPollQuestionKind; text: string; low?: string; high?: string };

const OPEN_ANSWERS = [
  "De opnames van de oefenzittingen komen vaak pas na twee weken online.",
  "Drie projecten met een deadline in dezelfde week is te veel.",
  "Graag een duidelijke beoordelingsfiche bij de groepsprojecten.",
  "Proefexamens wel, maar dan met een verbetersleutel.",
  "De planning van de labo's botst met die van het keuzevak.",
  "Meer voorbeeldexamens op Toledo zou al veel helpen.",
  "De lessen na 18 uur zijn moeilijk te combineren met een job.",
  "Feedback op tussentijdse opdrachten komt vaak te laat om er iets mee te doen.",
  "Duidelijker communiceren wanneer een les niet doorgaat.",
  "De studietijd van het project ligt veel hoger dan de studiepunten.",
];

/** Voorspelbaar maar afwisselend, zodat de resultaten er echt uitzien. */
function demoValue(kind: PocPollQuestionKind, voter: number, question: number): number | null {
  if (kind === "OPEN") return null;
  const mix = (voter * 7 + question * 3) % 10;
  if (kind === "YES_NO") return mix < 7 ? 1 : 0;
  return [1, 2, 2, 3, 3, 3, 4, 4, 4, 5][mix];
}

async function clear(prisma: PrismaClient): Promise<void> {
  await prisma.pocPoll.deleteMany({ where: { id: { startsWith: POLL_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
}

async function createPoll(
  prisma: PrismaClient,
  input: {
    suffix: string;
    pocId: string;
    title: string;
    publishedAt: Date | null;
    opensAt: Date;
    closesAt: Date;
    meetingDate: Date | null;
    summary?: string;
    questions: DemoQuestion[];
    voters: Array<{ key: string; year: StudyYear }>;
  },
): Promise<void> {
  const id = input.suffix ? `${POLL_PREFIX}-${input.suffix}` : POLL_PREFIX;
  await prisma.pocPoll.create({
    data: {
      id,
      pocId: input.pocId,
      titleNl: input.title,
      publishedAt: input.publishedAt,
      opensAt: input.opensAt,
      closesAt: input.closesAt,
      meetingDate: input.meetingDate,
      summaryNl: input.summary ?? null,
      summaryPublishedAt: input.summary ? new Date() : null,
      questions: {
        create: input.questions.map((question, order) => ({
          id: `${id}-q${order}`,
          order,
          kind: question.kind,
          textNl: question.text,
          lowLabelNl: question.low ?? null,
          highLabelNl: question.high ?? null,
        })),
      },
    },
  });

  await prisma.pocPollAnswer.createMany({
    data: input.questions.flatMap((question, order) =>
      input.voters.flatMap((voter, index) => {
        // Niet iedereen beantwoordt een open vraag.
        if (question.kind === "OPEN" && index % 2 === 1) return [];
        return [
          {
            questionId: `${id}-q${order}`,
            voterKey: `${id}-${voter.key}`,
            value: demoValue(question.kind, index, order),
            text: question.kind === "OPEN" ? OPEN_ANSWERS[index % OPEN_ANSWERS.length] : null,
            studyYears: [voter.year],
          },
        ];
      }),
    ),
  });
}

async function main() {
  assertLocalDatabase();
  const prisma = new PrismaClient();
  try {
    await clear(prisma);
    if (process.argv.includes("--reset")) {
      console.log("Voorbeeld van de peilingen opgeruimd.");
      return;
    }

    const poc = await prisma.poc.findFirst({
      where: { NOT: { studyProgrammes: { isEmpty: true } } },
      orderBy: { order: "asc" },
      select: { id: true, nameNl: true, studyProgrammes: true },
    });
    if (!poc) {
      console.error("Geen POC met een richting. Voeg er een toe in /admin/pocs.");
      process.exit(1);
    }

    const programme: StudyProgramme = poc.studyProgrammes[0];
    const profile = {
      onboardedAt: new Date(),
      studyConfirmedYear: currentStudyYear(),
      studyProgrammes: [programme],
    };

    // De accounts om mee aan te melden. De student heeft nog niets ingevuld, dus
    // hij krijgt de strook; de RiVer is bewust geen beheerder.
    const passwordHash = await hash(PASSWORD);
    const logins = [
      { email: `student${DOMAIN}`, firstName: "Demo", lastName: "Student", isSuperAdmin: false, years: ["MASTER_1"] as StudyYear[] },
      { email: `river${DOMAIN}`, firstName: "Demo", lastName: "RiVer", isSuperAdmin: false, years: ["MASTER_2"] as StudyYear[] },
      { email: `beheer${DOMAIN}`, firstName: "Demo", lastName: "Beheer", isSuperAdmin: true, years: ["MASTER_2"] as StudyYear[] },
    ];
    let riverId = "";
    for (const login of logins) {
      const user = await prisma.user.create({
        data: {
          email: login.email,
          name: `${login.firstName} ${login.lastName}`,
          firstName: login.firstName,
          lastName: login.lastName,
          isSuperAdmin: login.isSuperAdmin,
          studyYears: login.years,
          ...profile,
        },
      });
      await prisma.account.create({
        data: {
          id: `credential:${user.id}`,
          accountId: user.id,
          providerId: "credential",
          userId: user.id,
          password: passwordHash,
        },
      });
      if (login.email.startsWith("river")) riverId = user.id;
    }
    await prisma.pocRepresentative.create({
      data: { pocId: poc.id, userId: riverId, year: currentWorkingYear(), roleNl: "RiVer master", order: 0 },
    });

    // De studenten die de deelname tellen; aanmelden kunnen die niet.
    const voters: Array<{ key: string; year: StudyYear }> = [];
    let number = 0;
    for (const phase of PHASES) {
      await prisma.user.createMany({
        data: Array.from({ length: phase.students }, (_, index) => ({
          email: `student-${number + index + 1}${DOMAIN}`,
          name: `Demostudent ${number + index + 1}`,
          studyYears: [phase.year],
          ...profile,
        })),
      });
      for (let index = 0; index < phase.voters; index++) voters.push({ key: `v${voters.length}`, year: phase.year });
      number += phase.students;
    }

    const now = new Date();
    const inDays = (days: number) => new Date(now.getTime() + days * DAY);
    const dateIn = (days: number) => new Date(`${ymdKey(shiftYMD(brusselsYMD(now), days))}T00:00:00.000Z`);

    await createPoll(prisma, {
      suffix: "",
      pocId: poc.id,
      title: "Werkdruk en lesopnames",
      publishedAt: inDays(-1),
      opensAt: inDays(-1),
      closesAt: inDays(14),
      meetingDate: dateIn(16),
      questions: [
        { kind: "YES_NO", text: "Moeten lesopnames standaard online komen?" },
        { kind: "SCORE", text: "De werkdruk van dit semester is haalbaar.", low: "Helemaal oneens", high: "Helemaal eens" },
        { kind: "YES_NO", text: "Wil je in december een proefexamen per vak?" },
        { kind: "OPEN", text: "Wat moet zeker op de POC aangekaart worden?" },
      ],
      voters: voters.filter((_, index) => index % 2 === 0),
    });

    await createPoll(prisma, {
      suffix: "resultaten",
      pocId: poc.id,
      title: "Evaluatie van de groepsprojecten",
      publishedAt: inDays(-20),
      opensAt: inDays(-20),
      closesAt: inDays(-6),
      meetingDate: dateIn(2),
      questions: [
        { kind: "YES_NO", text: "Weet je vooraf hoe je project beoordeeld wordt?" },
        { kind: "SCORE", text: "De werklast van de groepsprojecten is haalbaar.", low: "Helemaal oneens", high: "Helemaal eens" },
        { kind: "OPEN", text: "Wat zou je veranderen aan de groepsprojecten?" },
      ],
      voters,
    });

    await createPoll(prisma, {
      suffix: "samenvatting",
      pocId: poc.id,
      title: "Examenperiode januari",
      publishedAt: inDays(-40),
      opensAt: inDays(-40),
      closesAt: inDays(-26),
      meetingDate: dateIn(-24),
      summary:
        "We brachten dit naar de POC. **Afgesproken:** de examenregeling komt voortaan twee weken vroeger online, en elke opleiding krijgt een proefexamen in december.",
      questions: [
        { kind: "YES_NO", text: "Is de examenregeling duidelijk?" },
        { kind: "SCORE", text: "Er zit genoeg tijd tussen de examens.", low: "Helemaal oneens", high: "Helemaal eens" },
      ],
      voters: voters.filter((_, index) => index % 5 !== 4),
    });

    await createPoll(prisma, {
      suffix: "concept",
      pocId: poc.id,
      title: "Keuzevakken volgend jaar",
      publishedAt: null,
      opensAt: now,
      closesAt: inDays(21),
      meetingDate: null,
      questions: [
        { kind: "YES_NO", text: "Vind je het aanbod aan keuzevakken groot genoeg?" },
        { kind: "OPEN", text: "Welk keuzevak mis je?" },
      ],
      voters: [],
    });

    console.log(`Voorbeeld staat klaar bij ${poc.nameNl}: 4 peilingen en ${number} studenten.`);
    console.log(`Aanmelden: student${DOMAIN}, river${DOMAIN} of beheer${DOMAIN}, wachtwoord ${PASSWORD}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
