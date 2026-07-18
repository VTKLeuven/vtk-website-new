import Image from 'next/image';
import { copy, getLocale } from '@/lib/i18n';

const MAIN_URL = process.env.VTK_MAIN_URL || 'https://vtk.be';

export async function SiteFooter() {
  const locale = await getLocale();
  const t = copy[locale];
  return (
    <footer className="logistics-footer mt-auto text-white">
      <div className="mx-auto grid w-full max-w-[1320px] gap-8 px-5 py-10 sm:px-9 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="flex items-start gap-4">
          <Image src="/VTK.png" alt="" width={660} height={777} className="h-12 w-auto" />
          <div>
            <p className="text-lg font-semibold tracking-tight text-vtk-paper">
              {t.footerTitle}
            </p>
            <p className="mt-2 max-w-lg text-sm leading-6 text-[#b7c0dc]">
              {t.footerLead}
            </p>
          </div>
        </div>
        <p className="text-sm leading-6 text-[#b7c0dc] md:text-right">
          {t.questions} Mail{' '}
          <a href="mailto:logistiek@vtk.be" className="text-white underline decoration-vtk-yellow underline-offset-4">
            logistiek@vtk.be
          </a>{' '}
          <br className="hidden md:block" />
          <a href={MAIN_URL} className="text-white underline decoration-vtk-yellow underline-offset-4">
            vtk.be
          </a>
        </p>
      </div>
    </footer>
  );
}
