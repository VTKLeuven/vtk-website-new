import Image from 'next/image';
import { copy, getLocale } from '@/lib/i18n';
import { getPublicCopy } from '@/lib/public-copy';

const MAIN_URL = process.env.VTK_MAIN_URL || 'https://vtk.be';

export async function SiteFooter() {
  const locale = await getLocale();
  const t = copy[locale];
  const content = await getPublicCopy(locale);
  return (
    <footer className="logistics-footer mt-auto text-vtk-on-dark">
      <div className="logistics-gutter grid gap-8 py-10 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="flex items-start gap-4">
          <Image src="/VTK.png" alt="" width={660} height={777} className="h-12 w-auto" />
          <div>
            <p className="text-lg font-semibold tracking-tight text-vtk-on-dark">
              {t.footerTitle}
            </p>
            {content.footerLead ? (
              <p className="mt-2 max-w-lg text-sm leading-6 text-vtk-on-dark-muted">
                {content.footerLead}
              </p>
            ) : null}
          </div>
        </div>
        <p className="text-sm leading-6 text-vtk-on-dark-muted md:text-right">
          {t.questions} Mail{' '}
          <a href="mailto:logistiek@vtk.be" className="text-vtk-on-dark underline decoration-vtk-yellow underline-offset-4">
            logistiek@vtk.be
          </a>{' '}
          <br className="hidden md:block" />
          <a href={MAIN_URL} className="text-vtk-on-dark underline decoration-vtk-yellow underline-offset-4">
            vtk.be
          </a>
          {' · '}
          <a
            href={`${MAIN_URL}${locale === 'en' ? '/en' : ''}/privacy`}
            className="text-vtk-on-dark underline decoration-vtk-yellow underline-offset-4"
          >
            {locale === 'en' ? 'Privacy' : 'Privacy'}
          </a>
        </p>
      </div>
    </footer>
  );
}
