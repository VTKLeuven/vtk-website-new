import { notFound } from "next/navigation";
import { Card, Label, Input, Select, Button } from "@vtk/ui";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { getDictionary } from "@vtk/i18n";
import { updateProfileAction, logoutAction } from "@/app/actions/auth";

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const session = await requireSession(`/inloggen?next=${locale === "nl" ? "" : "/en"}/account`);
  const dict = getDictionary(locale);

  async function onSave(formData: FormData) {
    "use server";
    await updateProfileAction(session.user.id, formData);
  }

  return (
    <div className="vtk-page vtk-page-shell vtk-page-narrow space-y-6">
      <div>
        <div className="vtk-page-kicker">VTK</div>
        <h1 className="text-4xl font-semibold tracking-tight text-vtk-ink">{dict.auth.account}</h1>
      </div>
      <Card className="p-6">
        <form action={onSave} className="space-y-4">
          <div>
            <Label>{dict.auth.email}</Label>
            <Input defaultValue={session.user.email} disabled />
          </div>
          <div>
            <Label htmlFor="name">{locale === "nl" ? "Naam" : "Name"}</Label>
            <Input id="name" name="name" defaultValue={session.user.name} required />
          </div>
          <div>
            <Label htmlFor="locale">{dict.header.language}</Label>
            <Select id="locale" name="locale" defaultValue={session.user.locale}>
              <option value="NL">Nederlands</option>
              <option value="EN">English</option>
            </Select>
          </div>
          <Button type="submit">{dict.auth.updateProfile}</Button>
        </form>
      </Card>
      <form action={logoutAction}>
        <Button variant="ghost" type="submit">
          {dict.auth.signOut}
        </Button>
      </form>
    </div>
  );
}
