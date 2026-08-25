export const metadata = {
  title: "Foto's",
  description: "Sfeerbeelden en foto's van 't ElixIr feestjes.",
};

const ALBUMS = [
  { title: 'Opening Party 2026', date: 'Februari 2026', count: "48 foto's" },
  { title: 'St. Barbara Cantus & Naspel', date: 'December 2025', count: "112 foto's" },
  { title: 'KoeLixir Themed Night', date: 'November 2025', count: "84 foto's" },
  { title: 'OZA Bar night', date: 'Oktober 2025', count: "65 foto's" },
  { title: 'VTK Openingsfeest', date: 'September 2025', count: "140 foto's" },
];

export default function FotosPage() {
  return (
    <>
      <div className="fakbar-page-head">
        <div className="fakbar-page-head-inner">
          <p className="fakbar-eyebrow"><span>📸</span><span>'t ElixIr</span></p>
          <h1>Feestfoto's</h1>
          <p className="fakbar-page-intro">Herbeleef de beste avonden in 't ElixIr.</p>
        </div>
      </div>

      <div className="fakbar-page-content">
        <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-3">
          {ALBUMS.map((album, i) => (
            <div
              key={i}
              className="group overflow-hidden rounded-[18px] border border-[--line] bg-[--surface] transition hover:border-[--line-2] hover:-translate-y-1"
            >
              <div className="flex h-44 items-center justify-center bg-[--paper-2] text-[--muted] transition group-hover:text-[--body]">
                <svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-[--ink]">{album.title}</h3>
                <div className="mt-1 flex justify-between text-xs text-[--muted]">
                  <span>{album.date}</span>
                  <span>{album.count}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
