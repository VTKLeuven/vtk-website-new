import Image from 'next/image';
import { copy, getLocale } from '@/lib/i18n';
import { getPublicCopy } from '@/lib/public-copy';

const MAIN_URL = process.env.VTK_MAIN_URL || 'https://vtk.be';
const FOOTER_LINK =
  'inline-flex min-h-control items-center text-vtk-on-dark underline decoration-vtk-yellow underline-offset-4';

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
        {/* Elke link 40 px hoog (M5): als tekstlink in een zin was hij 17 px, en
            op een telefoon lagen vtk.be en Privacy daardoor net te dicht. */}
        <div className="text-sm leading-6 text-vtk-on-dark-muted md:text-right">
          <p>
            {t.questions} Mail{' '}
            <a href="mailto:logistiek@vtk.be" className={FOOTER_LINK}>
              logistiek@vtk.be
            </a>
          </p>
          <p className="flex flex-wrap gap-x-5 md:justify-end">
            <a href={MAIN_URL} className={FOOTER_LINK}>
              vtk.be
            </a>
            <a href={`${MAIN_URL}${locale === 'en' ? '/en' : ''}/privacy`} className={FOOTER_LINK}>
              Privacy
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
