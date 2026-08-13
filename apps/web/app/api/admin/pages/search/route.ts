import { NextResponse } from "next/server";
import { prisma } from "@vtk/db";
import { requireSession, authErrorResponse } from "@/lib/session";

/**
 * Zoek bestaande pagina's om ze onder een categorie te hangen (server-side,
 * gelimiteerd).
 *
 * `GET /api/admin/pages/search?q=<term>&exclude=<headerTabId>` — bedoeld voor de
 * "pagina toevoegen"-picker in /admin/inhoud. Geeft altijd maar een handvol
 * matches terug in plaats van de hele tabel, zodat dit blijft schalen wanneer er
 * honderden pagina's zijn.
 *
 * Toegang: `pages.manage` (het recht van dat scherm) of superadmin.
 */
export async function GET(request: Request) {
  let session;
  try {
    session = await requireSession();
  } catch (err) {
    return authErrorResponse(err);
  }

  if (!session.user.isSuperAdmin && !session.permissions.includes("pages.manage")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  // Pagina's die al onder deze categorie hangen, zijn geen zinvol resultaat.
  const exclude = url.searchParams.get("exclude");

  // Vermijd zware "match alles"-queries: pas zoeken vanaf 2 tekens.
  if (q.length < 2) return NextResponse.json([]);

  const like = { contains: q, mode: "insensitive" } as const;
  const pages = await prisma.page.findMany({
    where: {
      AND: [
        { OR: [{ titleNl: like }, { titleEn: like }, { slug: like }] },
        // De uitsluiting moet expliciet "of helemaal geen categorie" bevatten.
        // `NOT: { headerTabId: exclude }` wordt in SQL `headerTabId <> $1`, en
        // daar valt NULL buiten (NULL <> 'x' is NULL, niet true). Precies de
        // pagina's die je hier zoekt zijn nog niet gekoppeld: een nieuwe pagina
        // start zonder categorie, en de Litus-import zette de meeste pagina's
        // los. Zonder deze OR verschijnen die nooit in de picker en is een
        // pagina aan een categorie hangen onmogelijk. De regel "niet gekoppeld"
        // in de resultatenlijst was dus onbereikbaar.
        ...(exclude
          ? [{ OR: [{ headerTabId: null }, { headerTabId: { not: exclude } }] }]
          : []),
      ],
    },
    orderBy: { titleNl: "asc" },
    take: 20,
    // Bewust geen inhoud of bijlagen: de picker toont enkel titel, slug en waar
    // de pagina nu hangt.
    select: {
      id: true,
      slug: true,
      titleNl: true,
      headerTab: { select: { labelNl: true, labelEn: true } },
    },
  });

  return NextResponse.json(
    pages.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.titleNl,
      categoryNl: p.headerTab?.labelNl ?? null,
      categoryEn: p.headerTab?.labelEn ?? null,
    })),
  );
}
