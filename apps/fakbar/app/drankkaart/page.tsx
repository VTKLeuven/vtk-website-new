import { prisma } from '@vtk/db';
import { ensureDefaultFakbarItems } from '@/app/actions/fakbar';

export const metadata = {
  title: 'Drankkaart',
  description: "Het volledige aanbod dranken en prijzen van 't ElixIr.",
};

const CATEGORIES = [
  { key: 'VAT', title: "Bieren van 't Vat", icon: '🍺' },
  { key: 'BIER_WIJN', title: 'Bieren op Fles & Wijn', icon: '🍾' },
  { key: 'FRISDRANK', title: 'Frisdranken', icon: '🥤' },
  { key: 'STERK', title: 'Sterke Drank', icon: '🥃' },
];

export default async function DrankkaartPage() {
  await ensureDefaultFakbarItems();
  const items = await prisma.fakbarItem.findMany({
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });

  return (
    <>
      <div className="fakbar-page-head">
        <div className="fakbar-page-head-inner">
          <p className="fakbar-eyebrow"><span>🍺</span><span>'t ElixIr</span></p>
          <h1>Drankkaart</h1>
          <p className="fakbar-page-intro">Alle prijzen zijn in Euro (€). Geniet maar drink met mate!</p>
        </div>
      </div>

      <div className="fakbar-page-content">
        <div className="grid gap-8">
          {CATEGORIES.map((cat) => {
            const categoryItems = items.filter((i) => i.category === cat.key);
            if (categoryItems.length === 0) return null;
            return (
              <section key={cat.key}>
                <div className="fakbar-section-head">
                  <h2>{cat.icon} {cat.title}</h2>
                </div>
                <div className="rounded-[18px] border border-[--line] bg-[--surface] overflow-hidden">
                  {categoryItems.map((item, idx) => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between px-6 py-4 ${idx < categoryItems.length - 1 ? 'border-b border-[--line]' : ''}`}
                    >
                      <span className="font-medium text-[--ink]">{item.name}</span>
                      <span className="font-semibold tabular-nums text-[--ink]">
                        €{(item.salesPrice / 100).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}
