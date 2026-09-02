"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { sendMail } from "@/lib/email";
import { requirePermission } from "@/lib/session";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { logAudit } from "@/lib/audit";
import { issueCode, pruneExpiredCodes, verifyCode } from "@/lib/urenloopApp/codes";
import { setAccessCookie } from "@/lib/urenloopApp/access";
import { CODE_TTL_MINUTES } from "@/lib/urenloopApp/config";

// -----------------------------------------------------------------------------
// Beheer (Admin -> IT -> 24UL App Download)
// -----------------------------------------------------------------------------

const emailSchema = z.string().trim().toLowerCase().email();

export async function addDownloadEmailAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requirePermission("urenloopApp.manage");

  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return saveError("INVALID_EMAIL");
  const email = parsed.data;
  const note = String(formData.get("note") ?? "").trim() || null;

  try {
    await prisma.urenloopDownloadEmail.create({
      data: { email, note, addedById: session.user.id },
    });
  } catch (error) {
    // Al op de lijst is geen serverfout maar een invoerfout; zie CLAUDE.md.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return saveError("DUPLICATE_EMAIL");
    }
    throw error;
  }

  await logAudit({
    action: "grant",
    entity: "urenloopDownload",
    target: email,
    summary: note ? `toegevoegd (${note})` : "toegevoegd",
  });
  revalidatePath("/admin/it/24ul-app");
  revalidatePath("/en/admin/it/24ul-app");
  return saveOk();
}

export async function removeDownloadEmailAction(formData: FormData): Promise<void> {
  await requirePermission("urenloopApp.manage");

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const removed = await prisma.urenloopDownloadEmail.delete({ where: { id } });

  // De openstaande codes van dat adres vervallen mee. Zonder dit blijft een net
  // gemailde code nog een uur werken voor iemand die je zojuist verwijderd hebt.
  await prisma.urenloopDownloadCode.deleteMany({ where: { email: removed.email } });

  // De gekoppelde computers worden meteen ingetrokken. De feed-route controleert
  // de lijst sowieso bij elke aanvraag, dus dit verandert niets aan wie er nog
  // updates krijgt; het maakt in de lijst zichtbaar waarom ze stopten.
  await prisma.urenloopDeviceToken.updateMany({
    where: { email: removed.email, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await logAudit({
    action: "revoke",
    entity: "urenloopDownload",
    target: removed.email,
    summary: "van de lijst gehaald",
  });
  revalidatePath("/admin/it/24ul-app");
  revalidatePath("/en/admin/it/24ul-app");
}

/**
 * Trekt één gekoppelde computer in. De app blijft werken; enkel de updates
 * stoppen, en de app zegt dan zelf dat er opnieuw gekoppeld moet worden.
 *
 * Bewust intrekken en niet verwijderen: de rij blijft staan zodat je in de lijst
 * ziet dat die laptop ooit gekoppeld was en wanneer hij eruit ging.
 */
export async function revokeDeviceAction(formData: FormData): Promise<void> {
  await requirePermission("urenloopApp.manage");

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const device = await prisma.urenloopDeviceToken.update({
    where: { id },
    data: { revokedAt: new Date() },
  });

  await logAudit({
    action: "revoke",
    entity: "urenloopDownload",
    target: device.email,
    summary: `computer "${device.label}" losgekoppeld`,
  });
  revalidatePath("/admin/it/24ul-app");
  revalidatePath("/en/admin/it/24ul-app");
}

// -----------------------------------------------------------------------------
// Publieke downloadpagina
// -----------------------------------------------------------------------------

/**
 * Vraagt een code aan.
 *
 * Antwoordt altijd hetzelfde, of het adres nu op de lijst staat of niet. Anders
 * is dit formulier een manier om te achterhalen welke kringen de app hebben, en
 * dat is precies de informatie die we niet publiek willen hebben.
 */
export async function requestCodeAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return saveError("INVALID_EMAIL");
  const email = parsed.data;

  await pruneExpiredCodes();

  const allowed = await prisma.urenloopDownloadEmail.findUnique({ where: { email } });
  if (!allowed) return saveOk();

  const issued = await issueCode(email);
  if (!issued.ok) return saveOk();

  const minutes = CODE_TTL_MINUTES;
  await sendMail(
    {
      to: email,
      subject: `Je code voor de 24urenloop-app: ${issued.code}`,
      text: [
        "Hallo,",
        "",
        `Je code om de 24urenloop-app te downloaden is: ${issued.code}`,
        "",
        `De code blijft ${minutes} minuten geldig en werkt één keer.`,
        "Vroeg je zelf geen code aan? Dan hoef je niets te doen; zonder de code gebeurt er niets.",
        "",
        "VTK Leuven",
      ].join("\n"),
    },
    { source: "urenloopApp" },
  );

  return saveOk();
}

export async function verifyCodeAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const parsedEmail = emailSchema.safeParse(formData.get("email"));
  const code = String(formData.get("code") ?? "").replace(/\s+/g, "");
  if (!parsedEmail.success || !/^\d{6}$/.test(code)) return saveError("INVALID_CODE");
  const email = parsedEmail.data;

  // Ook hier eerst de lijst: is een adres verwijderd nadat de code vertrok, dan
  // hoort die code niet meer te werken.
  const allowed = await prisma.urenloopDownloadEmail.findUnique({ where: { email } });
  if (!allowed) return saveError("INVALID_CODE");

  const result = await verifyCode(email, code);
  if (!result.ok) return saveError(result.reason === "TOO_MANY" ? "TOO_MANY" : "INVALID_CODE");

  await setAccessCookie(email);
  return saveOk();
}
