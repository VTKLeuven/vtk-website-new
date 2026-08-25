import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Fakbar Elixir Huren | VTK Leuven",
  description: "Informatie en voorwaarden om Fakbar Elixir te huren voor evenementen en feestjes.",
};

export default function FakbarHurenPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-8 border-b border-gray-200 pb-6">
        <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">VTK Leuven</span>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
          Fakbar Elixir Huren
        </h1>
        <p className="mt-2 text-lg text-gray-600">
          Zin om een feestje of activiteit te organiseren in de gezelligste fakbar van Leuven?
        </p>
      </div>

      <div className="space-y-8 text-gray-700">
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Huurvoorwaarden & Tarieven</h2>
          <ul className="space-y-3 list-disc pl-5">
            <li>
              <strong>Huurprijs:</strong> De standaard huurprijs voor externe feestjes bedraagt <strong>€250,00</strong>.
            </li>
            <li>
              <strong>Hoofdtapper:</strong> Er is steeds minstens één erkende Hoofdtapper van Fakbar Elixir aanwezig die het gebouw kent en de toog aanstelt.
            </li>
            <li>
              <strong>Drankafname:</strong> Alle dranken worden afgenomen via het standaard assortiment van Fakbar Elixir.
            </li>
            <li>
              <strong>Afrekening:</strong> De effectieve winst, eventuele drankkratten en vuil/schade worden verrekend op de eindfactuur.
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-6 text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Een datum vastleggen?</h2>
          <p className="text-sm text-gray-600 mb-6">
            Neem contact op met het fakbarteam van VTK om te kijken of jouw datum nog vrij is.
          </p>
          <a
            href="mailto:fakbar@vtk.be"
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition"
          >
            Aanvraag Sturen (fakbar@vtk.be)
          </a>
        </section>
      </div>
    </main>
  );
}
