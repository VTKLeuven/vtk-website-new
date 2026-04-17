import Link from "next/link";
import { getSession } from "@/lib/session";
import { isMemberOfGroup } from "@vtk/auth";

const MAIN_URL = process.env.VTK_MAIN_URL || "https://vtk.be";

export default async function LogistiekHome() {
  const session = await getSession();

  if (!session) {
    return (
      <main className="max-w-xl mx-auto p-8">
        <h1 className="text-3xl font-bold text-vtk-blue">VTK Logistiek</h1>
        <p className="mt-4 text-zinc-600">
          Je moet inloggen via de hoofdsite om deze module te gebruiken.
        </p>
        <Link
          href={`${MAIN_URL}/inloggen`}
          className="mt-6 inline-block rounded-full bg-vtk-yellow px-5 py-2.5 text-sm font-bold text-vtk-blue shadow-sm transition hover:bg-vtk-yellow-dark"
        >
          Inloggen op vtk.be
        </Link>
      </main>
    );
  }

  const allowed = session.user.isSuperAdmin || isMemberOfGroup(session, "Logistiek");
  if (!allowed) {
    return (
      <main className="max-w-xl mx-auto p-8">
        <h1 className="text-3xl font-bold text-vtk-blue">VTK Logistiek</h1>
        <p className="mt-4 text-zinc-600">
          Je account heeft geen toegang tot deze module. Neem contact op met
          Logistiek als je denkt dat dit een vergissing is.
        </p>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-vtk-blue">VTK Logistiek</h1>
        <div className="text-sm text-zinc-600">
          Ingelogd als <strong>{session.user.name}</strong>
        </div>
      </header>

      <section className="mt-8 rounded-2xl border border-vtk-blue/10 bg-white p-6 shadow-[0_8px_30px_-8px_rgba(26,31,74,0.1)]">
        <div className="mb-3 h-1 w-10 rounded-full bg-vtk-yellow" aria-hidden />
        <h2 className="text-xl font-bold text-vtk-blue">Planning van ritten</h2>
        <p className="mt-2 text-zinc-600">
          Deze submodule is een startpunt. Implementeer hier het reserveren van
          het busje, het plannen van ritten en het opvolgen van materiaal.
        </p>
        <ul className="mt-4 list-disc pl-6 text-zinc-700">
          <li>Sessie wordt gedeeld via <code>.vtk.be</code> cookie</li>
          <li>Toegang beperkt tot groep &quot;Logistiek&quot; of superadmins</li>
          <li>Geschreven met hetzelfde techstack als het hoofdportaal</li>
        </ul>
      </section>
    </main>
  );
}
