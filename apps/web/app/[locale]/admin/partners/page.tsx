import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { Button, Card, Input, Label } from "@vtk/ui";
import { deletePartnerAction, savePartnerAction } from "@/app/actions/pocs-partners";
import { publicUrl } from "@/lib/storage";
import { NewPartnerForm } from "./NewPartnerForm";

export default async function AdminPartners({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  await requirePermission("partners.manage");

  const partners = await prisma.partner.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }] });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{locale === "nl" ? "Partners beheren" : "Manage partners"}</h1>

      <Card className="p-5">
        <h2 className="font-semibold mb-3">{locale === "nl" ? "Nieuwe partner" : "New partner"}</h2>
        <NewPartnerForm locale={locale} />
      </Card>

      <Card className="overflow-hidden">
        <ul className="divide-y divide-zinc-200">
          {partners.map((p) => (
            <li key={p.id} className="p-4">
              <form action={savePartnerAction} className="grid grid-cols-1 md:grid-cols-[96px_1fr_auto] gap-4 items-center">
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="logoKey" value={p.logoKey} />
                <div>
                  {publicUrl(p.logoKey) ? (
                    <img src={publicUrl(p.logoKey)!} alt={p.name} className="h-20 w-20 object-contain" />
                  ) : null}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div><Label>Name</Label><Input name="name" defaultValue={p.name} required /></div>
                  <div><Label>URL</Label><Input name="url" defaultValue={p.url ?? ""} /></div>
                  <div><Label>Order</Label><Input name="order" type="number" defaultValue={p.order} /></div>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" name="active" defaultChecked={p.active} />
                    {locale === "nl" ? "Actief" : "Active"}
                  </label>
                  <div className="flex gap-2">
                    <Button size="sm" type="submit">{locale === "nl" ? "Opslaan" : "Save"}</Button>
                  </div>
                </div>
              </form>
              <form action={deletePartnerAction} className="mt-3">
                <input type="hidden" name="id" value={p.id} />
                <Button size="sm" variant="ghost" type="submit">
                  {locale === "nl" ? "Verwijderen" : "Delete"}
                </Button>
              </form>
            </li>
          ))}
          {partners.length === 0 && (
            <li className="p-8 text-center text-zinc-500">{locale === "nl" ? "Nog geen partners" : "No partners yet"}</li>
          )}
        </ul>
      </Card>
    </div>
  );
}
