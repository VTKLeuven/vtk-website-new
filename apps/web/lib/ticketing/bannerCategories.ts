import "server-only";
import { prisma } from "@vtk/db";
import { publicUrl } from "@/lib/storage";

/** Een kalenderthema met een standaardbanner, als keuze voor een ticketevent. */
export type TicketBannerCategory = {
  id: string;
  nameNl: string;
  nameEn: string;
  imageUrl: string;
};

/**
 * De thema's waarvan een ticketevent de standaardbanner kan lenen: dezelfde
 * die in /admin/kalender/categorieen een banner kregen. Een doelgroep draagt er
 * geen (zie lib/defaultEventImage.ts), dus die staat hier niet tussen.
 */
export async function listTicketBannerCategories(): Promise<TicketBannerCategory[]> {
  const categories = await prisma.calendarCategory.findMany({
    where: { audience: null, imageKey: { not: null } },
    select: { id: true, nameNl: true, nameEn: true, imageKey: true },
    orderBy: { order: "asc" },
  });
  return categories.flatMap((category) => {
    const imageUrl = publicUrl(category.imageKey);
    return imageUrl ? [{ id: category.id, nameNl: category.nameNl, nameEn: category.nameEn, imageUrl }] : [];
  });
}
