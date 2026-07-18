import type { CSSProperties, ReactNode } from 'react';

/* Gedeeld pagina-skelet: een compacte fotohero met dezelfde donkere scrim als
   de homepage en mediapagina. Het technisch patroon blijft subtiel aanwezig
   als tweede laag. Via `crop` kiest een pagina een eigen uitsnede. */
export function PageShell({
  kicker = 'VTK Logistiek',
  title,
  intro,
  crop = 'calc(50% - 320px) -180px',
  children,
}: {
  kicker?: ReactNode;
  title: ReactNode;
  intro?: ReactNode;
  crop?: string;
  children: ReactNode;
}) {
  return (
    <main className="flex-1">
      <header
        className="logistics-page-hero"
        style={{ '--band-crop': crop } as CSSProperties}
      >
        <div className="logistics-page-hero-inner mx-auto w-full max-w-[1320px] px-5 py-11 sm:px-9 sm:py-12">
          <p className="logistics-eyebrow">
            <span className="h-1.5 w-1.5 rounded-full bg-vtk-yellow" aria-hidden />
            {kicker}
          </p>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-[-0.03em] text-vtk-paper sm:text-4xl">
            {title}
          </h1>
          {intro ? <p className="mt-3 max-w-2xl leading-7 text-[#b7c0dc]">{intro}</p> : null}
        </div>
      </header>
      <div className="mx-auto w-full max-w-[1320px] px-5 py-8 sm:px-9">{children}</div>
    </main>
  );
}
