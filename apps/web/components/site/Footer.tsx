import { prisma } from "@vtk/db";
import { getDictionary, type Locale } from "@vtk/i18n";
import { publicUrl } from "@/lib/storage";

export async function Footer({ locale }: { locale: Locale }) {
  const partners = await prisma.partner.findMany({
    where: { active: true },
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });
  const dict = getDictionary(locale);

  return (
    <footer className="mt-20 border-t border-vtk-blue/10 bg-white">
      <div className="h-1 w-full bg-gradient-to-r from-vtk-blue via-vtk-blue-light to-vtk-yellow opacity-90" aria-hidden />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <h2 className="text-center text-xs font-bold uppercase tracking-[0.25em] text-vtk-blue/50">
          {dict.footer.partners}
        </h2>
        <div className="mt-8">
          {partners.length === 0 ? (
            <p className="text-center text-sm text-zinc-500">
              {dict.footer.noPartners}
            </p>
          ) : (
            <ul className="flex flex-wrap items-center justify-center gap-x-12 gap-y-8">
              {partners.map((p) => {
                const url = publicUrl(p.logoKey);
                const img = url ? (
                  <img
                    src={url}
                    alt={p.name}
                    className="h-11 w-auto max-w-[140px] object-contain opacity-90 grayscale-[0.2] transition hover:opacity-100 hover:grayscale-0"
                  />
                ) : (
                  <span className="text-sm font-medium text-zinc-600">{p.name}</span>
                );
                return (
                  <li key={p.id}>
                    {p.url ? (
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-lg p-2 ring-1 ring-transparent transition hover:ring-vtk-blue/10"
                      >
                        {img}
                      </a>
                    ) : (
                      img
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      <div className="border-t border-vtk-blue/8 bg-vtk-blue-soft/40 py-5 text-center text-xs">
        <p className="text-vtk-blue/55">
          © {new Date().getFullYear()} {dict.footer.copyright}
        </p>
      </div>
    </footer>
  );
}
