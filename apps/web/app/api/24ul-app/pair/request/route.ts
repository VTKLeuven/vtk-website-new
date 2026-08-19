import { z } from "zod";
import { prisma } from "@vtk/db";
import { sendMail } from "@vtk/mail";
import { issueCode, pruneExpiredCodes } from "@/lib/urenloopApp/codes";
import { CODE_TTL_MINUTES } from "@/lib/urenloopApp/config";

/**
 * Stap 1 van het koppelen: de app vraagt een code aan voor een adres.
 *
 * Dezelfde codes als de downloadpagina, en om dezelfde reden hetzelfde antwoord
 * of het adres nu op de lijst staat of niet: anders is deze route een manier om
 * te overlopen welke kringen de app hebben, en die is van buitenaf te bevragen.
 */
const schema = z.object({ email: z.string().trim().toLowerCase().email() });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ ok: false }, { status: 400 });
  const { email } = parsed.data;

  await pruneExpiredCodes();

  const allowed = await prisma.urenloopDownloadEmail.findUnique({ where: { email } });
  if (allowed) {
    const issued = await issueCode(email);
    if (issued.ok) {
      await sendMail({
        to: email,
        subject: `Je code om de 24urenloop-app te koppelen: ${issued.code}`,
        text: [
          "Hallo,",
          "",
          `Je code om deze computer aan de 24urenloop-app te koppelen is: ${issued.code}`,
          "",
          `De code blijft ${CODE_TTL_MINUTES} minuten geldig en werkt één keer.`,
          "Koppelen zorgt dat de app zelf nieuwe versies vindt; de app werkt ook zonder.",
          "",
          "Vroeg je zelf geen code aan? Dan hoef je niets te doen.",
          "",
          "VTK Leuven",
        ].join("\n"),
      });
    }
  }

  // Altijd hetzelfde antwoord, ook wanneer er niets verstuurd is.
  return Response.json({ ok: true });
}
