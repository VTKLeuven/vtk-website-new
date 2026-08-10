import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireFormCapability } from "@/lib/forms/authorization";
import { FormAdminNav } from "@/components/forms/admin/FormAdminNav";

export default async function FormAdminDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; formId: string }>;
}) {
  const { locale, formId } = await params;
  if (!hasLocale(locale)) notFound();
  const { form, capabilities } = await requireFormCapability(formId, "VIEW_FORM");

  return (
    <div className="ticket-admin-event">
      <FormAdminNav form={form} capabilities={capabilities} locale={locale} />
      {children}
    </div>
  );
}
