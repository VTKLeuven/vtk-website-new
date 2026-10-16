/**
 * Maakt het formulier "Commu-aanvraag" aan: de opvolger van de Google Form
 * waarmee posten hun evenementen aanmelden voor de communicatieplanning
 * (weekoverzicht, Bakske, sociale media).
 *
 * Draaien (lokaal, op dev of op prod):
 *
 *   npm run forms:commu
 *
 * Idempotent op de slug `commu-aanvraag`. Bestaat het formulier al, dan blijft
 * het zoals het is: commu past de vragen daarna zelf aan in de formulierbouwer,
 * en een tweede run mag dat werk niet overschrijven. Het script zet enkel de
 * koppeling in de instellingen (`communicatie.requestForm`) goed, want daaraan
 * herkent /admin/commu-aanvragen welk formulier de aanvragen bevat.
 *
 * Het formulier start als concept. Commu leest het na en publiceert het in
 * /admin/formulieren.
 *
 * De veldcodes liggen vast: het overzicht leest `evenement`, `post`,
 * `facebook`, `bakske`, `promo`, `facebook_tekst` en `bakske_tekst`. De
 * optiecodes van `post` zijn de slugs van de posten, zodat een gekozen
 * evenement zijn post zelf aanduidt.
 */

import { PrismaClient, type Prisma } from "@prisma/client";

const SLUG = "commu-aanvraag";
const SETTING_KEY = "communicatie.requestForm";

type OptionSpec = { code: string; label: string; next?: string };
type FieldSpec = {
  code: string;
  type: Prisma.FormFieldCreateWithoutFormInput["type"];
  label: string;
  help?: string;
  required?: boolean;
  config?: Prisma.InputJsonValue;
  options?: OptionSpec[];
};
type SectionSpec = { key: string; title: string; description?: string; next?: string; fields: FieldSpec[] };

const LATER = "Kan je later nog aanvullen via Commu-aanvragen in de admin.";

const SECTIONS: SectionSpec[] = [
  {
    key: "evenement",
    title: "Evenement",
    description:
      "Kies je evenement uit de kalender; de rest van deze stap vult zich dan in. Je kan alles nog aanpassen.",
    // Wie bij de post "Andere" invult, gaat meteen naar de communicatievragen.
    next: "communicatie",
    fields: [
      {
        code: "evenement",
        type: "CALENDAR_EVENT",
        label: "Evenement",
        help: "Staat je evenement er niet tussen? Laat dit leeg en vul hieronder zelf in.",
        config: {
          fills: {
            TITLE: "naam",
            DATE: "datum",
            START_TIME: "beginuur",
            END_TIME: "einduur",
            LOCATION: "locatie",
            POST: "post",
          },
        },
      },
      { code: "naam", type: "SHORT_TEXT", label: "Naam activiteit", required: true },
      { code: "datum", type: "DATE", label: "Datum activiteit", required: true },
      { code: "beginuur", type: "TIME", label: "Beginuur", required: true },
      { code: "einduur", type: "TIME", label: "Einduur" },
      { code: "locatie", type: "SHORT_TEXT", label: "Locatie", required: true },
      {
        code: "verantwoordelijke",
        type: "PROFILE",
        label: "Verantwoordelijke",
        help: "Het aanspreekpunt voor commu. Staat op jouw naam; pas aan als iemand anders het opvolgt.",
        required: true,
        config: { profileField: "NAME" },
      },
      {
        code: "post",
        type: "SINGLE_CHOICE",
        label: "Post",
        required: true,
        config: { allowOther: true, otherLabelNl: "Andere post" },
        options: [
          { code: "activiteiten", label: "Activiteiten", next: "acti" },
          { code: "onthaal", label: "Onthaal", next: "onthaal" },
          { code: "internationaal", label: "Internationaal", next: "internationaal" },
        ],
      },
    ],
  },
  {
    key: "acti",
    title: "Acti-script",
    next: "communicatie",
    fields: [
      {
        code: "soort_acti",
        type: "SINGLE_CHOICE",
        label: "Soort evenement",
        required: true,
        options: [
          { code: "cantus", label: "Cantus" },
          { code: "massacantus", label: "Massacantus" },
          { code: "grote_activiteit", label: "Grote activiteit" },
          { code: "kleine_activiteit", label: "Kleine activiteit" },
          { code: "onthaal", label: "Onthaal" },
        ],
      },
    ],
  },
  {
    key: "internationaal",
    title: "Internationaal",
    next: "communicatie",
    fields: [
      {
        code: "soort_internationaal",
        type: "SINGLE_CHOICE",
        label: "Soort evenement",
        required: true,
        options: [
          { code: "cantus", label: "Cantus" },
          { code: "andere", label: "Andere" },
        ],
      },
    ],
  },
  {
    key: "onthaal",
    title: "Onthaal",
    next: "communicatie",
    fields: [
      {
        code: "soort_onthaal",
        type: "SINGLE_CHOICE",
        label: "Soort evenement",
        required: true,
        options: [
          { code: "peme", label: "Peme" },
          { code: "eerstejaars_activiteit", label: "Eerstejaars activiteit" },
          { code: "onderwijs", label: "Onderwijs" },
        ],
      },
    ],
  },
  {
    key: "communicatie",
    title: "Communicatie",
    fields: [
      {
        code: "facebook",
        type: "SINGLE_CHOICE",
        label: "Facebookevenement",
        required: true,
        options: [
          { code: "nl", label: "Ja, enkel gefocust op Nederlandse studenten." },
          {
            code: "nl_engels_welkom",
            label: "Ja, gefocust op Nederlandse studenten, maar Engelse studenten ook welkom.",
          },
          { code: "tweetalig", label: "Ja, makkelijk te volgen door beide. (ENG & NL tekstje)" },
          { code: "internationaal", label: "Ja, gefocust op internationale studenten." },
          { code: "nee", label: "Nee" },
        ],
      },
      { code: "facebook_online", type: "DATE", label: "Voorkeur facebookevenement online" },
      { code: "facebook_tekst", type: "LONG_TEXT", label: "Facebooktekstje", help: LATER },
      {
        code: "bakske",
        type: "SINGLE_CHOICE",
        label: "Bakske",
        required: true,
        config: { allowOther: true },
        options: [
          { code: "week_van", label: "Week van het evenement" },
          { code: "week_voordien", label: "1 week op voorhand" },
          { code: "niet", label: "Niet" },
        ],
      },
      { code: "bakske_tekst", type: "LONG_TEXT", label: "Baksketekstje", help: LATER },
      {
        code: "promo",
        type: "MULTIPLE_CHOICE",
        label: "Promomateriaal",
        config: { allowOther: true },
        options: [
          { code: "drukwerk", label: "Drukwerk (contacteer commu)" },
          { code: "fotograaf_commu", label: "Fotograaf (door commu)" },
          { code: "fotograaf_post", label: "Fotograaf (door post)" },
          { code: "live_coverage", label: "Live coverage (timelapse, extra insta stories, ...)" },
          { code: "aftermovie", label: "Aftermovie (voor grote evenement)" },
        ],
      },
      {
        code: "meerdere_data",
        type: "SHORT_TEXT",
        label: "Is je evenement meerdere dagen of herhalend? (Geef hier de andere data)",
        help: "Bij twijfel: dien per datum een aanvraag in.",
      },
      { code: "opmerkingen", type: "LONG_TEXT", label: "Speciale verzoeken of opmerkingen?" },
    ],
  },
];

async function main() {
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.form.findUnique({ where: { slug: SLUG }, select: { id: true } });
    if (existing) {
      await linkSetting(prisma, existing.id);
      console.log(`Het formulier "${SLUG}" bestaat al (${existing.id}); enkel de koppeling is gezet.`);
      return;
    }

    const owner = await prisma.group.findFirst({ where: { code: "COMMUNICATIE" }, select: { id: true } });
    if (!owner) throw new Error("De post Communicatie (code COMMUNICATIE) bestaat niet.");

    const formId = await prisma.$transaction(async (tx) => {
      const form = await tx.form.create({
        data: {
          slug: SLUG,
          titleNl: "Commu-aanvraag",
          introNl:
            "Voor elk evenement dat in de communicatieplanning moet komen: het weekoverzicht, het Bakske en de sociale media. Eén aanvraag per evenement. Je volgt ze op, en vult je tekstjes later nog aan, via **Commu-aanvragen** in de admin.",
          ownerGroupId: owner.id,
          status: "DRAFT",
          audience: "MEMBERS",
          listed: false,
          localeMode: "NL_ONLY",
          unavailableEn: "This form is only available in Dutch.",
          stepBySections: true,
          allowMultipleSubmissions: true,
          allowEditAfterSubmit: true,
          notifyMode: "EACH",
          notifyEmails: ["communicatie@vtk.be"],
          thankYouNl:
            "Bedankt! Commu bekijkt je aanvraag. In de admin, onder Commu-aanvragen, zie je de stand van zaken en vul je je tekstjes nog aan.",
        },
        select: { id: true },
      });

      // Alle commu-leden volgen de aanvragen op, niet enkel de leiding.
      await tx.formGroupGrant.create({
        data: { formId: form.id, groupId: owner.id, role: "EDITOR", scope: "ALL_MEMBERS" },
      });

      const sectionIds = new Map<string, string>();
      for (const [index, spec] of SECTIONS.entries()) {
        const section = await tx.formSection.create({
          data: {
            formId: form.id,
            sortOrder: index,
            titleNl: spec.title,
            descriptionNl: spec.description ?? null,
          },
          select: { id: true },
        });
        sectionIds.set(spec.key, section.id);
      }

      let sortOrder = 0;
      for (const spec of SECTIONS) {
        const sectionId = sectionIds.get(spec.key)!;
        if (spec.next) {
          await tx.formSection.update({
            where: { id: sectionId },
            data: { nextSectionId: sectionIds.get(spec.next)! },
          });
        }
        for (const field of spec.fields) {
          const created = await tx.formField.create({
            data: {
              formId: form.id,
              sectionId,
              code: field.code,
              type: field.type,
              sortOrder: sortOrder++,
              labelNl: field.label,
              helpNl: field.help ?? null,
              required: field.required ?? false,
              config: field.config ?? {},
            },
            select: { id: true },
          });
          for (const [optionIndex, option] of (field.options ?? []).entries()) {
            await tx.formFieldOption.create({
              data: {
                formId: form.id,
                fieldId: created.id,
                code: option.code,
                labelNl: option.label,
                sortOrder: optionIndex,
                nextSectionId: option.next ? sectionIds.get(option.next)! : null,
              },
            });
          }
        }
      }

      return form.id;
    });

    await linkSetting(prisma, formId);
    console.log(`Formulier "${SLUG}" aangemaakt (${formId}) als concept. Publiceer het in /admin/formulieren.`);
  } finally {
    await prisma.$disconnect();
  }
}

async function linkSetting(prisma: PrismaClient, formId: string) {
  await prisma.setting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: { formId } },
    update: { value: { formId } },
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
