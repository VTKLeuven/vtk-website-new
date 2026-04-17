import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { Card, Button, Input, Label } from "@vtk/ui";
import { hasLocale } from "@/lib/locale";
import { getDictionary } from "@vtk/i18n";
import { getSession } from "@/lib/session";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale } = await params;
  const { next } = await searchParams;
  if (!hasLocale(locale)) notFound();

  const session = await getSession();
  if (session) redirect(next && next.startsWith("/") ? next : "/");
  const dict = getDictionary(locale);

  return (
    <div className="relative mx-auto max-w-md px-4 py-16">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-64 max-w-lg rounded-full bg-vtk-yellow/15 blur-3xl"
        aria-hidden
      />
      <Card className="relative p-8 sm:p-10">
        <div className="mb-2 h-1 w-12 rounded-full bg-vtk-yellow" aria-hidden />
        <h1 className="mb-6 text-2xl font-bold tracking-tight text-vtk-blue">{dict.auth.signIn}</h1>
        <LoginForm
          nextParam={next ?? ""}
          labels={{
            email: dict.auth.email,
            password: dict.auth.password,
            signIn: dict.auth.signIn,
            invalid: dict.auth.invalidCredentials,
          }}
        />
      </Card>
    </div>
  );
}
