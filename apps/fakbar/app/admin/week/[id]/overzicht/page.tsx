import { getOrCreateCurrentWeek } from "@/app/actions/fakbar";
import Link from "next/link";

export const metadata = {
  title: "Weekoverzicht | Admin Fakbar",
};

export default async function WeekoverzichtPage() {
  const currentWeek = await getOrCreateCurrentWeek(2026, 7);

  // Sample calculations based on Excel formulas
  const totalOmzet = 2676.20;
  const gemisteInkomsten = 570.24;
  const verwachteInkomsten = 2886.46;
  const weekDelta = totalOmzet - verwachteInkomsten; // -210.26

  return (
    <div className="min-h-screen bg-black text-white px-6 py-12">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex justify-between items-center border-b border-neutral-800 pb-6">
          <div>
            <Link href="/admin" className="text-xs text-neutral-400 hover:text-white transition">&larr; Terug naar Dashboard</Link>
            <h1 className="text-3xl font-extrabold tracking-tight mt-1">WEEKOVERZICHT (WEEK {currentWeek.weekNumber})</h1>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid sm:grid-cols-3 gap-6">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
            <span className="text-xs text-neutral-400 font-medium uppercase">Totale Omzet</span>
            <div className="text-3xl font-bold mt-1 text-white">€{totalOmzet.toFixed(2)}</div>
            <span className="text-xs text-neutral-500 mt-2 block">Som van Cash & Bancontact</span>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
            <span className="text-xs text-neutral-400 font-medium uppercase">Gemiste Inkomsten (Tappersblad)</span>
            <div className="text-3xl font-bold mt-1 text-rose-400">€{gemisteInkomsten.toFixed(2)}</div>
            <span className="text-xs text-neutral-500 mt-2 block">Tappersdrank & Mislukte pinten</span>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
            <span className="text-xs text-neutral-400 font-medium uppercase">Weekdelta</span>
            <div className="text-3xl font-bold mt-1 text-amber-400">€{weekDelta.toFixed(2)}</div>
            <span className="text-xs text-neutral-500 mt-2 block">Verschil met verwachte inkomsten</span>
          </div>
        </div>

        {/* Breakdown per Day */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-neutral-800">
            <h2 className="text-xl font-bold">Overzicht per Dag</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-neutral-300">
              <thead className="bg-neutral-800/60 text-xs font-semibold uppercase text-neutral-400 border-b border-neutral-800">
                <tr>
                  <th className="px-6 py-4">Dag</th>
                  <th className="px-4 py-4">Hoofdtapper</th>
                  <th className="px-4 py-4 text-right">Omzet</th>
                  <th className="px-4 py-4 text-right">Gemiste Inkomsten</th>
                  <th className="px-4 py-4 text-right">Naar Kluis</th>
                  <th className="px-4 py-4">Speciale Activiteit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {currentWeek.evenings.map((evening) => (
                  <tr key={evening.id} className="hover:bg-neutral-800/40 transition">
                    <td className="px-6 py-4 font-bold text-white">{evening.dayOfWeek}</td>
                    <td className="px-4 py-4">{evening.hoofdtapper?.name || "Renske"}</td>
                    <td className="px-4 py-4 text-right font-medium text-white">€{(evening.bancontactRevenue / 100).toFixed(2)}</td>
                    <td className="px-4 py-4 text-right text-rose-400">€91,28</td>
                    <td className="px-4 py-4 text-right font-semibold text-emerald-400">€{(evening.cashToSafe / 100).toFixed(2)}</td>
                    <td className="px-4 py-4 text-neutral-400">{evening.specialeActiviteit || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
