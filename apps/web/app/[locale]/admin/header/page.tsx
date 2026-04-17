import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { Button, Card, Input, Label } from "@vtk/ui";
import { saveHeaderTabAction, deleteHeaderTabAction } from "@/app/actions/pages";
import type { Locale } from "@vtk/i18n";

export default async function AdminHeader({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  await requirePermission("header.manage");
  const tabs = await prisma.headerTab.findMany({ orderBy: { order: "asc" } });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">
        {locale === "nl" ? "Header beheren" : "Manage header"}
      </h1>

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
