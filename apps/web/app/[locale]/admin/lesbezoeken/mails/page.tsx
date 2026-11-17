import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { getLesbezoekConfig, getLesbezoekTemplates, lesbezoekSenderLabel } from "@/lib/lesbezoeken-server";
import { signatureForUser } from "@/lib/mailSignature-server";
import { lesbezoekAccess } from "../access";
import { MailSettingsCard } from "../MailSettingsCard";

/**
 * Tabblad Mails: de sjablonen en wanneer de herinnering vertrekt. De voorbeelden
 * dragen de ondertekening van wie kijkt, want die verstuurt ze straks.
 */
export default async function AdminLesbezoekenMailsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const nl = locale === "nl";
  const { session, canManage } = await lesbezoekAccess();
  const [config, templates, signature] = await Promise.all([
    getLesbezoekConfig(),
    getLesbezoekTemplates(),
    signatureForUser(session.user.id, nl ? "nl" : "en"),
  ]);
  return (
    <MailSettingsCard
      nl={nl}
      canManage={canManage}
      config={config}
      templates={templates}
      senderLabel={lesbezoekSenderLabel()}
      signature={signature}
    />
  );
}
