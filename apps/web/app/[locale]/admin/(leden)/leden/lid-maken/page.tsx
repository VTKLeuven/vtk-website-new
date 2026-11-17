import { redirect } from "next/navigation";

/** "Lid maken" was een eigen tabblad; het staat nu bovenaan het tabblad Leden. */
export default async function AdminLedenGrant({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ jaar?: string }> }) {
  const [{ locale }, { jaar }] = await Promise.all([params, searchParams]);
  redirect(`${locale === "en" ? "/en" : ""}/admin/leden${jaar ? `?jaar=${encodeURIComponent(jaar)}` : ""}`);
}
