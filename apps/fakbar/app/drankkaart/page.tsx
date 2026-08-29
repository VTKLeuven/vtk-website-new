import type { Metadata } from 'next';
import { prisma } from '@vtk/db';
import { ElixirIcon } from '@/components/elixir-icon';
import { SpecialsBoard } from '@/components/specials-board';
import { CATEGORY_ORDER, CATEGORY_LABELS, CATEGORY_ICONS, formatEuro } from '@/lib/fakbar-format';
import { getSpecialsBoard } from '@/lib/specials';

export const metadata: Metadata = {
  title: 'Drankkaart',
  description: "Het volledige drankaanbod en de prijzen van 't ElixIr.",
};

export const revalidate = 300;

export default async function DrankkaartPage() {
  // Bewust geen seed-aanroep hier. Dit is een publieke pagina: die hoort te
  // lezen en niet te schrijven, zeker niet bij elke GET van een bezoeker. De
  // standaardkaart aanmaken doe je vanuit /admin/instellingen.
  const [items, board] = await Promise.all([
    prisma.fakbarItem.findMany({ orderBy: [{ name: 'asc' }] }),
    getSpecialsBoard(),
  ]);

  const groups = CATEGORY_ORDER.map((key) => ({
    key,
    label: CATEGORY_LABELS[key],
    icon: CATEGORY_ICONS[key],
    items: items.filter((item) => item.category === key),
  })).filter((group) => group.items.length > 0);

  return (
    <>
      <div className="fakbar-page-head">
        <div className="fakbar-page-head-inner">
          <p className="fakbar-eyebrow">&rsquo;t ElixIr</p>
          <h1>Drankkaart</h1>
          <p className="fakbar-page-intro">
            Alle prijzen in euro, zoals ze aan de toog hangen. Wijzigen we iets, dan staat het hier meteen mee.
          </p>
        </div>
      </div>

      <div className="fakbar-page-content">
        {board ? (
          <div className="mb-9">
            <SpecialsBoard board={board} />
          </div>
        ) : null}

        {groups.length === 0 ? (
          <div className="fakbar-empty">
            <h3>Nog geen drankkaart</h3>
            <p>
              Er staan nog geen artikelen in. De fakbar vult de kaart aan vanuit het beheer; kom straks nog eens
              terug.
            </p>
          </div>
        ) : (
          <>
            <nav className="fakbar-menu-nav" aria-label="Naar een categorie">
              {groups.map((group) => (
                <a key={group.key} href={`#${group.key.toLowerCase()}`} className="fakbar-chip">
                  <ElixirIcon name={group.icon} className="h-4 w-4 text-[var(--muted)]" />
                  {group.label}
                </a>
              ))}
            </nav>

            <div className="grid gap-10">
              {groups.map((group) => (
                <section key={group.key} id={group.key.toLowerCase()} className="scroll-mt-24">
                  <div className="fakbar-section-head">
                    <h2 className="flex items-center gap-2.5">
                      <ElixirIcon name={group.icon} className="h-5 w-5 text-[var(--muted)]" />
                      {group.label}
                    </h2>
                  </div>
                  <div className="fakbar-menu-list">
                    {group.items.map((item) => (
                      <div key={item.id} className="fakbar-menu-row">
                        <span className="name">{item.name}</span>
                        <span className="leader" aria-hidden />
                        <span className="price">{formatEuro(item.salesPrice)}</span>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}

        <p className="mt-10 text-sm text-[var(--muted)]">Geniet, maar drink met mate.</p>
      </div>
    </>
  );
}
