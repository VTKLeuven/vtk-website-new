import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { getDictionary, type Locale } from "@vtk/i18n";
import { Button, Card, Input, Label, Select, Textarea } from "@vtk/ui";
import { DeleteButton, DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { SaveForm } from "@/components/ui/SaveForm";
import { saveErrorMessages } from "@/lib/saveMessages";
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
  const dict = getDictionary(locale);

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
        <SaveForm
          action={savePocAction}
          className="grid grid-cols-1 md:grid-cols-2 gap-3 [&>button]:justify-self-start"
          submitLabel={locale === "nl" ? "Aanmaken" : "Create"}
          savingLabel={dict.common.saving}
          savedMessage={locale === "nl" ? "POC aangemaakt" : "POC created"}
          errorMessages={saveErrorMessages(locale)}
          fallbackErrorMessage={dict.common.saveError}
        >
          <div><Label>Slug</Label><Input name="slug" required /></div>
          <div><Label>Study track</Label><Input name="studyTrack" required placeholder="Bv. Computer Science" /></div>
          <div><Label>Name (NL)</Label><Input name="nameNl" required /></div>
          <div><Label>Name (EN)</Label><Input name="nameEn" /></div>
          <div className="md:col-span-2"><Label>Description (NL)</Label><Textarea name="descriptionNl" rows={2} /></div>
          <div className="md:col-span-2"><Label>Description (EN)</Label><Textarea name="descriptionEn" rows={2} /></div>
          <div><Label>Order</Label><Input name="order" type="number" defaultValue={pocs.length} /></div>
        </SaveForm>
      </Card>

      {pocs.map((poc) => (
        <Card key={poc.id} className="p-5 space-y-4">
          <SaveForm
            action={savePocAction}
            className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end [&>button]:justify-self-start"
            submitLabel={dict.admin.save}
            savingLabel={dict.common.saving}
            savedMessage={dict.common.saved}
            errorMessages={saveErrorMessages(locale)}
            fallbackErrorMessage={dict.common.saveError}
          >
            <input type="hidden" name="id" value={poc.id} />
            <div className="md:col-span-2"><Label>Name (NL)</Label><Input name="nameNl" defaultValue={poc.nameNl} required /></div>
            <div className="md:col-span-2"><Label>Name (EN)</Label><Input name="nameEn" defaultValue={poc.nameEn ?? ""} /></div>
            <div><Label>Slug</Label><Input name="slug" defaultValue={poc.slug} required /></div>
            <div><Label>Study track</Label><Input name="studyTrack" defaultValue={poc.studyTrack} required /></div>
            <div><Label>Order</Label><Input name="order" type="number" defaultValue={poc.order} /></div>
            <div className="md:col-span-5"><Label>Description (NL)</Label><Textarea name="descriptionNl" defaultValue={poc.descriptionNl ?? ""} rows={2} /></div>
            <div className="md:col-span-5"><Label>Description (EN)</Label><Textarea name="descriptionEn" defaultValue={poc.descriptionEn ?? ""} rows={2} /></div>
          </SaveForm>

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
                  <DeleteIconButton
                    action={removePocRepresentativeAction}
                    fields={{ id: r.id }}
                    label={locale === "nl" ? "Verwijderen" : "Remove"}
                    srLabel={`${locale === "nl" ? "Verwijderen" : "Remove"}: ${r.user.name}`}
                    title={
                      locale === "nl" ? "Vertegenwoordiger verwijderen?" : "Remove representative?"
                    }
                    description={
                      locale === "nl"
                        ? `${r.user.name} wordt van deze POC gehaald en verdwijnt van de publieke POC-pagina. Het account zelf blijft bestaan.`
                        : `${r.user.name} will be removed from this POC and disappears from the public POC page. The account itself is not deleted.`
                    }
                    confirmLabel={locale === "nl" ? "Verwijderen" : "Remove"}
                    cancelLabel={locale === "nl" ? "Annuleren" : "Cancel"}
                    successMessage={
                      locale === "nl" ? "Vertegenwoordiger verwijderd" : "Representative removed"
                    }
                  />
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

          <DeleteButton
            action={deletePocAction}
            fields={{ id: poc.id }}
            title={locale === "nl" ? "POC verwijderen?" : "Delete POC?"}
            description={
              locale === "nl"
                ? `"${poc.nameNl}" wordt permanent verwijderd, samen met de ${poc.representatives.length} vertegenwoordiger(s) die eraan hangen. Dit kan niet ongedaan gemaakt worden.`
                : `"${poc.nameNl}" will be permanently deleted, along with its ${poc.representatives.length} representative(s). This cannot be undone.`
            }
            confirmLabel={locale === "nl" ? "Verwijderen" : "Delete"}
            cancelLabel={locale === "nl" ? "Annuleren" : "Cancel"}
            successMessage={locale === "nl" ? "POC verwijderd" : "POC deleted"}
          >
            {locale === "nl" ? "POC verwijderen" : "Delete POC"}
          </DeleteButton>
        </Card>
      ))}
    </div>
  );
}
