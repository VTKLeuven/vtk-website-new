import { z } from "zod";
import { prisma } from "@vtk/db";
import { verifyCode } from "@/lib/urenloopApp/codes";
import { newDeviceToken } from "@/lib/urenloopApp/devices";

/**
 * Stap 2 van het koppelen: code inwisselen voor een apparaat-token.
 *
 * Het ruwe token gaat hier één keer over de lijn en wordt daarna enkel gehasht
 * bewaard; de app schrijft het naar zijn eigen datamap. Raakt het kwijt, dan
 * koppel je opnieuw, en het oude token blijft ongebruikt achter tot iemand het
 * intrekt.
 */
const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().trim().regex(/^\d{6}$/),
  label: z.string().trim().min(1).max(80),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "INVALID" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return Response.json({ ok: false, error: "INVALID" }, { status: 400 });
  const { email, code, label } = parsed.data;

  const allowed = await prisma.urenloopDownloadEmail.findUnique({ where: { email } });
  if (!allowed) return Response.json({ ok: false, error: "INVALID" }, { status: 400 });

  const result = await verifyCode(email, code);
  if (!result.ok) {
    return Response.json(
      { ok: false, error: result.reason === "TOO_MANY" ? "TOO_MANY" : "INVALID" },
      { status: 400 },
    );
  }

  const { raw, hash } = newDeviceToken();
  await prisma.urenloopDeviceToken.create({
    data: { email, tokenHash: hash, label },
  });

  return Response.json({ ok: true, token: raw });
}
