import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { Button, Card, Input, Label, Select, Textarea } from "@vtk/ui";
import {
  savePocAction,
  deletePocAction,
  addPocRepresentativeAction,
  removePocRepresentativeAction,
} from "@/app/actions/pocs-partners";

export default async function AdminPocs({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  await requirePermission("pocs.manage");

  const [pocs, users] = await Promise.all([
    prisma.poc.findMany({
      orderBy: { order: "asc" },
      include: { representatives: { include: { user: true } } },
    }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">
        {locale === "nl" ? "POC's beheren" : "Manage POCs"}
      </h1>

      <Card className="p-5">
        <h2 className="font-semibold mb-3">{locale === "nl" ? "Nieuwe POC" : "New POC"}</h2>
        <form action={savePocAction} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><Label>Slug</Label><Input name="slug" required /></div>
          <div><Label>Study track</Label><Input name="studyTrack" required placeholder="Bv. Computer Science" /></div>
          <div><Label>Name (NL)</Label><Input name="nameNl" required /></div>
          <div><Label>Name (EN)</Label><Input name="nameEn" /></div>
          <div className="md:col-span-2"><Label>Description (NL)</Label><Textarea name="descriptionNl" rows={2} /></div>
          <div className="md:col-span-2"><Label>Description (EN)</Label><Textarea name="descriptionEn" rows={2} /></div>
          <div><Label>Order</Label><Input name="order" type="number" defaultValue={pocs.length} /></div>
          <div className="flex items-end"><Button type="submit">{locale === "nl" ? "Aanmaken" : "Create"}</Button></div>
        </form>
      </Card>

      {pocs.map((poc) => (
        <Card key={poc.id} className="p-5 space-y-4">
          <form action={savePocAction} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
            <input type="hidden" name="id" value={poc.id} />
            <div className="md:col-span-2"><Label>Name (NL)</Label><Input name="nameNl" defaultValue={poc.nameNl} required /></div>
            <div className="md:col-span-2"><Label>Name (EN)</Label><Input name="nameEn" defaultValue={poc.nameEn ?? ""} /></div>
            <div><Label>Slug</Label><Input name="slug" defaultValue={poc.slug} required /></div>
            <div><Label>Study track</Label><Input name="studyTrack" defaultValue={poc.studyTrack} required /></div>
            <div><Label>Order</Label><Input name="order" type="number" defaultValue={poc.order} /></div>
            <div className="md:col-span-5"><Label>Description (NL)</Label><Textarea name="descriptionNl" defaultValue={poc.descriptionNl ?? ""} rows={2} /></div>
            <div className="md:col-span-5"><Label>Description (EN)</Label><Textarea name="descriptionEn" defaultValue={poc.descriptionEn ?? ""} rows={2} /></div>
            <div className="md:col-span-6 flex gap-2">
              <Button type="submit">{locale === "nl" ? "Opslaan" : "Save"}</Button>
            </div>
          </form>

          <div className="rounded-xl border border-zinc-200 p-4">
            <h3 className="font-semibold mb-3">{locale === "nl" ? "Vertegenwoordigers" : "Representatives"}</h3>
            <ul className="mb-4 divide-y divide-zinc-200">
              {poc.representatives.map((r) => (
                <li key={r.id} className="flex justify-between items-center py-2">
                  <span className="text-sm">
                    <span className="font-medium">{r.user.name}</span>{" "}
                    <span className="text-zinc-500">· {r.user.email}</span>{" "}
                    {r.roleNl && <span className="text-zinc-400">({r.roleNl})</span>}
                  </span>
                  <form action={removePocRepresentativeAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <Button variant="ghost" size="sm" type="submit">
                      {locale === "nl" ? "Verwijder" : "Remove"}
                    </Button>
                  </form>
                </li>
              ))}
              {poc.representatives.length === 0 && (
                <li className="py-2 text-sm text-zinc-500">{locale === "nl" ? "Nog geen." : "None yet."}</li>
              )}
            </ul>
            <form action={addPocRepresentativeAction} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <input type="hidden" name="pocId" value={poc.id} />
              <div className="md:col-span-2">
                <Label>{locale === "nl" ? "Gebruiker" : "User"}</Label>
                <Select name="userId" required defaultValue="">
                  <option value="" disabled>—</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                </Select>
              </div>
              <div><Label>Role (NL)</Label><Input name="roleNl" /></div>
              <div><Label>Role (EN)</Label><Input name="roleEn" /></div>
              <div><Button type="submit">{locale === "nl" ? "Toevoegen" : "Add"}</Button></div>
            </form>
          </div>

          <form action={deletePocAction}>
            <input type="hidden" name="id" value={poc.id} />
            <Button variant="danger" size="sm" type="submit">
              {locale === "nl" ? "POC verwijderen" : "Delete POC"}
            </Button>
          </form>
        </Card>
      ))}
    </div>
  );
}
