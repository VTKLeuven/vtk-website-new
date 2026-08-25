import { getOrCreateCurrentWeek } from "@/app/actions/fakbar";
import Link from "next/link";
import { notFound } from "next/navigation";

export const metadata = {
  title: "Dagtelling & Drankverbruik | Admin Fakbar",
};

export default async function DailyPage({ params }: { params: Promise<{ day: string }> }) {
  const { day } = await params;
  const currentWeek = await getOrCreateCurrentWeek(2026, 7);

  const evening = currentWeek.evenings.find(
    (e) => e.dayOfWeek.toLowerCase() === day.toLowerCase()
  );

  if (!evening) {
    notFound();
  }

  const denominations = [
    { label: "€0,05", key: "cnt_0_05" },
    { label: "€0,10", key: "cnt_0_10" },
    { label: "€0,20", key: "cnt_0_20" },
    { label: "€0,50", key: "cnt_0_50" },
    { label: "€1,00", key: "cnt_1_00" },
    { label: "€2,00", key: "cnt_2_00" },
    { label: "€5,00", key: "cnt_5_00" },
    { label: "€10,00", key: "cnt_10_00" },
    { label: "€20,00", key: "cnt_20_00" },
    { label: "€50,00", key: "cnt_50_00" },
    { label: "€100,00", key: "cnt_100_00" },
  ];

  const consumptionCategories = [
    { label: "Tappersdrank", category: "TAPPERSDRANK" },
    { label: "Verjaardagen", category: "VERJAARDAGEN" },
    { label: "Zakpintjes", category: "ZAKPINTJES" },
    { label: "Mislukte pinten", category: "MISLUKTE_PINTEN" },
    { label: "Klantenkaart", category: "KLANTENKAART" },
    { label: "Succespinten", category: "SUCCESPINTEN" },
  ];

  return (
    <div className="min-h-screen bg-black text-white px-6 py-12">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex justify-between items-center border-b border-neutral-800 pb-6">
          <div>
            <Link href="/admin" className="text-xs text-neutral-400 hover:text-white transition">&larr; Terug naar Dashboard</Link>
            <h1 className="text-3xl font-extrabold tracking-tight capitalize mt-1">{evening.dayOfWeek} TELLING & VERBRUIK</h1>
          </div>
        </div>

        {/* Hoofdtapper Info */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 flex justify-between items-center">
          <div>
            <span className="text-xs text-neutral-400 font-medium uppercase">Hoofdtapper</span>
            <div className="text-xl font-bold mt-1 text-white">{evening.hoofdtapper?.name || "Renske"}</div>
          </div>
          <div className="text-right">
            <span className="text-xs text-neutral-400 font-medium uppercase">Naar Kluis</span>
            <div className="text-xl font-bold mt-1 text-emerald-400">€{(evening.cashToSafe / 100).toFixed(2)}</div>
          </div>
        </div>

        {/* Kassa Telling Table */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
          <h2 className="text-xl font-bold mb-4">1. Kassa Briefgeld & Muntgeld (Eindtelling)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {denominations.map((denom) => (
              <div key={denom.key} className="bg-neutral-800/50 p-3 rounded-lg border border-neutral-700/50 flex justify-between items-center">
                <span className="text-sm font-medium text-neutral-300">{denom.label}</span>
                <input
                  type="number"
                  defaultValue={0}
                  className="w-16 bg-neutral-900 border border-neutral-700 text-white text-center py-1 rounded text-sm font-semibold"
                />
              </div>
            ))}
          </div>

          <div className="mt-6 pt-6 border-t border-neutral-800 grid sm:grid-cols-3 gap-4">
            <div className="bg-neutral-800/50 p-3 rounded-lg border border-neutral-700/50">
              <span className="text-xs text-neutral-400 font-medium block">ElixIrbonnen</span>
              <input type="number" defaultValue={2} className="mt-1 w-full bg-neutral-900 border border-neutral-700 text-white p-1 rounded text-sm font-semibold" />
            </div>
            <div className="bg-neutral-800/50 p-3 rounded-lg border border-neutral-700/50">
              <span className="text-xs text-neutral-400 font-medium block">Guidogids</span>
              <input type="number" defaultValue={0} className="mt-1 w-full bg-neutral-900 border border-neutral-700 text-white p-1 rounded text-sm font-semibold" />
            </div>
            <div className="bg-neutral-800/50 p-3 rounded-lg border border-neutral-700/50">
              <span className="text-xs text-neutral-400 font-medium block">Medewerkersbonnen</span>
              <input type="number" defaultValue={0} className="mt-1 w-full bg-neutral-900 border border-neutral-700 text-white p-1 rounded text-sm font-semibold" />
            </div>
          </div>
        </div>

        {/* Tappersblad / Drankverbruik */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
          <h2 className="text-xl font-bold mb-4">2. Tappersblad & Omzetverlies</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {consumptionCategories.map((cat) => (
              <div key={cat.category} className="bg-neutral-800/50 p-4 rounded-lg border border-neutral-700/50 flex justify-between items-center">
                <span className="text-sm font-medium text-neutral-300">{cat.label}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    defaultValue={0}
                    className="w-20 bg-neutral-900 border border-neutral-700 text-white text-center py-1 rounded text-sm font-semibold"
                  />
                  <span className="text-xs text-neutral-500">stuks</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button className="bg-white text-black font-bold px-8 py-3 rounded-xl hover:bg-neutral-200 transition">
            Telling Opslaan
          </button>
        </div>
      </div>
    </div>
  );
}
