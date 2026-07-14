import { prisma, HEADER_TABS } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { Button, Card, Input, Label } from "@vtk/ui";
import { saveHeaderTabAction, deleteHeaderTabAction, importDefaultHeaderTabsAction } from "@/app/actions/pages";
import type { Locale } from "@vtk/i18n";

export default async function AdminHeader({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  await requirePermission("header.manage");
  const tabs = await prisma.headerTab.findMany({ orderBy: { order: "asc" } });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">
        {nl ? "Header beheren" : "Manage header"}
      </h1>

      {tabs.length === 0 && (
        <Card className="border border-vtk-yellow-dark/30 bg-vtk-yellow/10 p-5">
          <h2 className="font-semibold text-vtk-ink">
            {nl ? "Header gebruikt momenteel standaardtabs" : "Header is currently using default tabs"}
          </h2>
          <p className="mt-2 text-sm text-[#34405e]">
            {nl
              ? "De navigatie valt terug op de ingebouwde standaardtabs omdat er nog geen tabs in de database staan. Importeer ze om ze hier te beheren (herordenen, hernoemen, verbergen of verwijderen)."
              : "The navigation falls back to the built-in default tabs because none are stored in the database yet. Import them to manage them here (reorder, rename, hide or delete)."}
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {HEADER_TABS.map((t) => (
              <li key={t.code} className="rounded-full border border-vtk-blue/15 bg-white px-3 py-1 text-sm text-vtk-ink">
                {nl ? t.labelNl : t.labelEn}
              </li>
            ))}
          </ul>
          <form action={importDefaultHeaderTabsAction} className="mt-4">
            <Button type="submit">
              {nl ? "Standaardtabs importeren" : "Import default tabs"}
            </Button>
          </form>
        </Card>
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-vtk-blue-soft text-left">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Slug</th>
              <th className="px-3 py-2">Label (NL)</th>
              <th className="px-3 py-2">Label (EN)</th>
              <th className="px-3 py-2">{locale === "nl" ? "Zichtbaar" : "Visible"}</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {tabs.length === 0 && (
              <tr className="border-t border-zinc-200">
                <td className="px-3 py-6 text-center text-sm text-[#5c667f]" colSpan={7}>
                  {nl
                    ? "Nog geen tabs in de database. Importeer hierboven de standaardtabs of voeg er hieronder een toe."
                    : "No tabs in the database yet. Import the default tabs above or add one below."}
                </td>
              </tr>
            )}
            {tabs.map((t) => (
              <tr key={t.id} className="border-t border-zinc-200">
                <form
                  action={saveHeaderTabAction}
                  className="contents"
                >
                  <input type="hidden" name="id" value={t.id} />
                  <td className="px-3 py-2"><Input name="order" type="number" defaultValue={t.order} className="w-16" /></td>
                  <td className="px-3 py-2"><Input name="code" defaultValue={t.code} className="w-28" /></td>
                  <td className="px-3 py-2"><Input name="slug" defaultValue={t.slug} className="w-36" /></td>
                  <td className="px-3 py-2"><Input name="labelNl" defaultValue={t.labelNl} /></td>
                  <td className="px-3 py-2"><Input name="labelEn" defaultValue={t.labelEn} /></td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" name="visible" defaultChecked={t.visible} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" type="submit">{locale === "nl" ? "Opslaan" : "Save"}</Button>
                  </td>
                </form>
              </tr>
            ))}
            {tabs.map((t) => (
              <tr key={`del-${t.id}`} className="hidden" />
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold mb-3">
          {locale === "nl" ? "Nieuwe tab" : "New tab"}
        </h2>
        <form action={saveHeaderTabAction} className="grid grid-cols-1 sm:grid-cols-6 gap-3 items-end">
          <div>
            <Label>Order</Label>
            <Input name="order" type="number" defaultValue={tabs.length} />
          </div>
          <div>
            <Label>Code</Label>
            <Input name="code" required />
          </div>
          <div>
            <Label>Slug</Label>
            <Input name="slug" required />
          </div>
          <div>
            <Label>Label (NL)</Label>
            <Input name="labelNl" required />
          </div>
          <div>
            <Label>Label (EN)</Label>
            <Input name="labelEn" required />
          </div>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" name="visible" defaultChecked />
              {locale === "nl" ? "Zichtbaar" : "Visible"}
            </label>
            <Button type="submit">{locale === "nl" ? "Toevoegen" : "Add"}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
