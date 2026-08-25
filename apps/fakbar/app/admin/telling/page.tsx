import { getOrCreateCurrentWeek } from "@/app/actions/fakbar";
import Link from "next/link";

export const metadata = {
  title: "Stocktelling | Admin Fakbar",
};

export default async function StocktellingPage() {
  const currentWeek = await getOrCreateCurrentWeek(2026, 7);

  return (
    <div className="min-h-screen bg-black text-white px-6 py-12">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex justify-between items-center border-b border-neutral-800 pb-6">
          <div>
            <Link href="/admin" className="text-xs text-neutral-400 hover:text-white transition">&larr; Terug naar Dashboard</Link>
            <h1 className="text-3xl font-extrabold tracking-tight mt-1">STOCKTELLING (WEEK {currentWeek.weekNumber})</h1>
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-neutral-300">
              <thead className="bg-neutral-800 text-xs font-semibold uppercase text-neutral-400 border-b border-neutral-700">
                <tr>
                  <th className="px-6 py-4">Item</th>
                  <th className="px-4 py-4 text-center">Begin Opslag</th>
                  <th className="px-4 py-4 text-center">Levering</th>
                  <th className="px-4 py-4 text-center">Naar Frigo</th>
                  <th className="px-4 py-4 text-center">Eind Opslag</th>
                  <th className="px-4 py-4 text-center">Verschil</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {currentWeek.stockCounts.map((sc) => (
                  <tr key={sc.id} className="hover:bg-neutral-800/40 transition">
                    <td className="px-6 py-4 font-medium text-white">{sc.item.name}</td>
                    <td className="px-4 py-4 text-center">{sc.beginOpslag}</td>
                    <td className="px-4 py-4 text-center">{sc.levering}</td>
                    <td className="px-4 py-4 text-center">{sc.naarFrigo}</td>
                    <td className="px-4 py-4 text-center">{sc.eindOpslag}</td>
                    <td className="px-4 py-4 text-center font-bold text-emerald-400">
                      {sc.eindTelling - sc.beginTelling}
                    </td>
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
