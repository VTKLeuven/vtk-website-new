import Link from "next/link";
import { getSession } from "@/lib/session";
import { isMemberOfGroup } from "@vtk/auth";

const MAIN_URL = process.env.VTK_MAIN_URL || "https://vtk.be";

export default async function LogistiekHome() {
  const session = await getSession();

  if (!session) {
    return (
      <main className="mx-auto grid min-h-screen w-full max-w-5xl place-items-center px-5 py-12">
        <section className="w-full max-w-xl rounded-[22px] border border-vtk-blue/10 bg-white p-8 shadow-[0_18px_50px_rgba(10,15,31,0.06)]">
          <div className="mb-4 inline-grid h-9 w-9 place-items-center rounded-lg bg-vtk-navy text-sm font-bold text-vtk-yellow">
            vtk
          </div>
          <h1 className="text-4xl font-semibold tracking-[-0.03em] text-vtk-ink">VTK Logistiek</h1>
          <p className="mt-4 leading-7 text-[#34405e]">
            Je moet inloggen via de hoofdsite om deze module te gebruiken.
          </p>
          <Link
            href={`${MAIN_URL}/inloggen`}
            className="mt-6 inline-flex rounded-full bg-vtk-ink px-5 py-2.5 text-sm font-semibold text-vtk-surface transition hover:bg-vtk-navy"
          >
            Inloggen op vtk.be
          </Link>
        </section>
      </main>
    );
  }

  const allowed = session.user.isSuperAdmin || isMemberOfGroup(session, "Logistiek");
  if (!allowed) {
    return (
      <main className="mx-auto grid min-h-screen w-full max-w-5xl place-items-center px-5 py-12">
        <section className="w-full max-w-xl rounded-[22px] border border-vtk-blue/10 bg-white p-8 shadow-[0_18px_50px_rgba(10,15,31,0.06)]">
          <div className="mb-4 inline-grid h-9 w-9 place-items-center rounded-lg bg-vtk-navy text-sm font-bold text-vtk-yellow">
            vtk
          </div>
          <h1 className="text-4xl font-semibold tracking-[-0.03em] text-vtk-ink">VTK Logistiek</h1>
          <p className="mt-4 leading-7 text-[#34405e]">
            Je account heeft geen toegang tot deze module. Neem contact op met
            Logistiek als je denkt dat dit een vergissing is.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-12">
      <header className="flex flex-wrap items-center justify-between gap-5 border-b border-vtk-blue/10 pb-8">
        <div>
          <div className="mb-3 inline-grid h-9 w-9 place-items-center rounded-lg bg-vtk-navy text-sm font-bold text-vtk-yellow">
            vtk
          </div>
          <h1 className="text-5xl font-semibold tracking-[-0.035em] text-vtk-ink">VTK Logistiek</h1>
        </div>
        <div className="rounded-full border border-vtk-blue/10 bg-white px-4 py-2 text-sm text-[#5c667f]">
          Ingelogd als <strong>{session.user.name}</strong>
        </div>
      </header>

      <section className="mt-8 rounded-[22px] border border-vtk-blue/10 bg-white p-7 shadow-[0_18px_50px_rgba(10,15,31,0.06)]">
        <div className="mb-3 h-2 w-2 rounded-full bg-vtk-yellow" aria-hidden />
        <h2 className="text-2xl font-semibold tracking-tight text-vtk-ink">Planning van ritten</h2>
        <p className="mt-2 max-w-2xl leading-7 text-[#34405e]">
          Deze submodule is een startpunt. Implementeer hier het reserveren van
          het busje, het plannen van ritten en het opvolgen van materiaal.
        </p>
        <ul className="mt-5 grid gap-3 text-sm text-[#34405e]">
          <li>Sessie wordt gedeeld via <code>.vtk.be</code> cookie</li>
          <li>Toegang beperkt tot groep &quot;Logistiek&quot; of superadmins</li>
          <li>Geschreven met hetzelfde techstack als het hoofdportaal</li>
        </ul>
      </section>
    </main>
  );
}
