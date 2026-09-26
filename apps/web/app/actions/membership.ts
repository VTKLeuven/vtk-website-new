"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@vtk/db";
import { requirePermission, requireSession } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { currentStudyYear, formatWorkingYear } from "@/lib/workingYear";
import {
  getMembershipConfig,
  membershipOffer,
  recordMembershipChoice,
  saveMembershipConfig,
} from "@/lib/membership";
import { MAX_MEMBERSHIP_PRICE_CENTS } from "@/lib/membership/config";

/** Foutcodes die het beheerscherm zelf vertaalt. */
export type MembershipErrorCode =
  | "INVALID_PRICE"
  | "INVALID_USER"
  | "ALREADY_MEMBER"
  | "ALREADY_HONORARY"
  | "MEMBERSHIP_CLOSED";

function revalidate(): void {
  revalidatePath("/admin/leden");
  revalidatePath("/lidmaatschap");
  revalidatePath("/account");
}

function revalidateHonorary(userId: string): void {
  revalidatePath("/admin/leden");
  revalidatePath(`/admin/gebruikers/${userId}`);
}

const priceSchema = z
  .string()
  .trim()
  .transform((raw) => raw.replace(",", "."))
  .refine((raw) => /^\d+(\.\d{1,2})?$/.test(raw), { message: "INVALID_PRICE" })
  .transform((raw) => Math.round(Number(raw) * 100))
  .refine((cents) => cents >= 0 && cents <= MAX_MEMBERSHIP_PRICE_CENTS, {
    message: "INVALID_PRICE",
  });

/** De prijs en of de twee wegen naar een lidmaatschap openstaan. */
export async function saveMembershipConfigAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("leden.manage");

  const parsed = priceSchema.safeParse(String(formData.get("externalPrice") ?? ""));
  if (!parsed.success) return saveError("INVALID_PRICE" satisfies MembershipErrorCode);

  const config = {
    externalPriceCents: parsed.data,
    facultyOpen: formData.get("facultyOpen") === "on",
    externalOpen: formData.get("externalOpen") === "on",
  };
  const previous = await getMembershipConfig();
  await saveMembershipConfig(config);

  await logAudit({
    action: "update",
    entity: "vtkMembership",
    target: "Instellingen",
    summary:
      `prijs ${(previous.externalPriceCents / 100).toFixed(2)} -> ` +
      `${(config.externalPriceCents / 100).toFixed(2)} euro, ` +
      `gratis ${config.facultyOpen ? "open" : "dicht"}, ` +
      `betalend ${config.externalOpen ? "open" : "dicht"}`,
  });
  revalidate();
  return saveOk();
}

/**
 * Iemand handmatig lid maken, zonder betaling.
 *
 * Bestaat omdat niet elk lidmaatschap via het formulier loopt: iemand betaalt
 * cash aan de toog, een uitwisselingsstudent valt buiten de faculteitscheck, of
 * KU Leuven geeft de faculteit van iemand verkeerd door. Altijd `MANUAL`, ook
 * voor een student van de faculteit, zodat in de ledenlijst zichtbaar blijft
 * dat een beheerder dit deed en wie.
 */
export async function grantMembershipAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requirePermission("leden.manage");

  const userId = String(formData.get("userId") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);
  const yearRaw = String(formData.get("year") ?? "");
  const year = /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : currentStudyYear();
  if (!userId) return saveError("INVALID_USER" satisfies MembershipErrorCode);

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!user) return saveError("INVALID_USER" satisfies MembershipErrorCode);

  const existing = await prisma.membership.findUnique({
    where: { userId_year: { userId, year } },
    select: { activatedAt: true },
  });
  if (existing?.activatedAt) return saveError("ALREADY_MEMBER" satisfies MembershipErrorCode);

  await recordMembershipChoice(userId, "MANUAL", {
    year,
    priceCents: 0,
    grantedById: session.user.id,
    note: note || undefined,
  });

  await logAudit({
    action: "grant",
    entity: "vtkMembership",
    entityId: userId,
    target: user.name,
    summary: `lid gemaakt voor ${formatWorkingYear(year)}${note ? `: ${note}` : ""}`,
  });
  revalidate();
  return saveOk();
}

/**
 * Een lidmaatschap intrekken.
 *
 * Verwijdert de rij, en daarmee ook de betaalpogingen die eraan hangen; een
 * lidmaatschap dat niet had mogen bestaan, hoort geen spoor in het ledenaantal
 * of de omzet achter te laten. Wie effectief betaalde, hoort dus eerst
 * terugbetaald te worden, en dat gebeurt niet via deze knop.
 */
export async function revokeMembershipAction(formData: FormData): Promise<void> {
  await requirePermission("leden.manage");
  const id = String(formData.get("membershipId") ?? "");
  if (!id) return;

  const membership = await prisma.membership.findUnique({
    where: { id },
    include: { user: { select: { name: true } } },
  });
  if (!membership) return;

  await prisma.membership.delete({ where: { id } });
  await logAudit({
    action: "revoke",
    entity: "vtkMembership",
    entityId: membership.userId,
    target: membership.user.name,
    summary: `lidmaatschap ${formatWorkingYear(membership.year)} ingetrokken`,
  });
  revalidate();
}

/**
 * Iemand erelid maken (`User.honoraryMember`).
 *
 * Staat bij de leden en niet op de gebruikerspagina: wie ereleden beheert, wil
 * de lijst zien en er iemand bij zetten, niet elk account apart openen. Het
 * recht is `leden.manage`, hetzelfde als iemand gratis lid maken: beide geven
 * toegang tot tickets die anderen niet zien.
 */
export async function grantHonoraryAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("leden.manage");

  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) return saveError("INVALID_USER" satisfies MembershipErrorCode);

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, name: true, honoraryMember: true },
  });
  if (!user) return saveError("INVALID_USER" satisfies MembershipErrorCode);
  if (user.honoraryMember) return saveError("ALREADY_HONORARY" satisfies MembershipErrorCode);

  await prisma.user.update({ where: { id: userId }, data: { honoraryMember: true } });
  await logAudit({
    action: "grant",
    entity: "honoraryMember",
    entityId: userId,
    target: user.name,
    summary: "erelid gemaakt",
  });
  revalidateHonorary(userId);
  return saveOk();
}

/**
 * Het erelidmaatschap intrekken. Raakt enkel de vlag: het account, een
 * lidmaatschap van de kring en tickets die al gekocht zijn, blijven staan.
 */
export async function revokeHonoraryAction(formData: FormData): Promise<void> {
  await requirePermission("leden.manage");
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, honoraryMember: true },
  });
  if (!user?.honoraryMember) return;

  await prisma.user.update({ where: { id: userId }, data: { honoraryMember: false } });
  await logAudit({
    action: "revoke",
    entity: "honoraryMember",
    entityId: userId,
    target: user.name,
    summary: "erelidmaatschap ingetrokken",
  });
  revalidateHonorary(userId);
}

/**
 * Alsnog lid worden, vanaf `/lidmaatschap`.
 *
 * Bestaat omdat de vraag bij de studiebevestiging bewust overslaanbaar is: wie
 * ze toen liet staan (of van gedacht veranderde) moet er later nog aan kunnen,
 * zonder te wachten tot de bevestiging van volgend academiejaar.
 *
 * Het aanbod wordt hier opnieuw bepaald in plaats van een gepostte waarde te
 * geloven: anders koopt iemand een gratis lidmaatschap door "faculty" mee te
 * sturen. De gratis weg meldt zich met een toast; de betalende gaat door naar
 * de betaalpagina, en dat is een ander scherm, dus daar is de redirect zelf de
 * bevestiging.
 */
export async function joinMembershipAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requireSession();
  const locale = String(formData.get("locale") ?? "nl") === "en" ? "en" : "nl";
  const year = currentStudyYear();

  const [user, existing, config] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { firwStudent: true },
    }),
    prisma.membership.findUnique({
      where: { userId_year: { userId: session.user.id, year } },
      select: { id: true, activatedAt: true },
    }),
    getMembershipConfig(),
  ]);

  // Al lid: niets te doen, en zeker geen tweede rij.
  if (existing?.activatedAt) return saveOk();

  const offer = membershipOffer(user, existing, config);
  // Een openstaande betaling is geen nieuw aanbod maar dezelfde afspraak: stuur
  // door naar het betaalscherm in plaats van de rij te herschrijven.
  if (offer.kind === "none") {
    if (existing) redirect(`${locale === "en" ? "/en" : ""}/lidmaatschap/betalen`);
    return saveError("MEMBERSHIP_CLOSED" satisfies MembershipErrorCode);
  }

  await recordMembershipChoice(session.user.id, offer.kind === "faculty" ? "FACULTY" : "EXTERNAL", {
    year,
    priceCents: offer.priceCents,
  });

  revalidate();
  // Buiten elke try/catch: redirect() werkt via een throw.
  if (offer.kind === "external") {
    redirect(`${locale === "en" ? "/en" : ""}/lidmaatschap/betalen`);
  }
  return saveOk();
}
