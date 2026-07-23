import { notFound } from 'next/navigation';
import Link from 'next/link';
import { LoginGate } from '@/components/login-gate';
import { PageShell } from '@/components/page-shell';
import { getSession } from '@/lib/session';
import { getLocale } from '@/lib/i18n';
import { formatEuro } from '@/lib/uitleen';
import { frequentlyRequestedWith, itemDetail } from '@/lib/uitleen-server';
import { ItemGallery } from './item-gallery';

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  if (!session) {
    return <LoginGate variant="item" />;
  }
  const en = locale === 'en';

  const { id } = await params;
  const item = await itemDetail(id);
  if (!item) notFound();

  const related = await frequentlyRequestedWith(item.id);
  const photos = [...(item.photoKey ? [item.photoKey] : []), ...item.photos.map((photo) => photo.key)];

  return (
    <PageShell
      kicker={
        <Link href="/materiaal" className="hover:underline">
          ← {en ? 'Back to catalogue' : 'Terug naar de catalogus'}
        </Link>
      }
      title={item.name}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <section className="overflow-hidden rounded-[18px] border border-vtk-navy/10 bg-vtk-surface">
            <ItemGallery name={item.name} keys={photos} categoryName={item.category?.name} />
            <div className="p-6">
              <div className="flex flex-wrap items-center gap-2">
                {item.category ? (
                  <span className="rounded-full bg-vtk-paper-2 px-2.5 py-0.5 text-xs font-medium text-vtk-navy">
                    {item.category.name}
                  </span>
                ) : null}
                {item.isSet ? (
                  <span className="rounded-full bg-vtk-yellow/25 px-2.5 py-0.5 text-xs font-semibold text-vtk-ink">
                    Set
                  </span>
                ) : null}
              </div>
              {item.description ? (
                <p className="mt-3 leading-7 text-vtk-body">{item.description}</p>
              ) : null}
            </div>
          </section>

          {item.properties.length > 0 ? (
            <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
              <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">{en ? 'Properties' : 'Eigenschappen'}</h2>
              <dl className="mt-3 divide-y divide-vtk-navy/10">
                {item.properties.map((property) => <div key={property.id} className="grid gap-1 py-2.5 sm:grid-cols-2"><dt className="text-sm text-vtk-muted">{property.label}</dt><dd className="text-sm font-medium text-vtk-ink">{property.value}</dd></div>)}
              </dl>
            </section>
          ) : null}

          {item.downloads.length > 0 ? (
            <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
              <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">{en ? 'Downloads' : 'Downloads'}</h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">{item.downloads.map((download) => <li key={download.id}><a href={`/api/media/${download.key.split('/').map(encodeURIComponent).join('/')}`} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-[14px] border border-vtk-navy/10 px-4 py-3 text-sm font-medium text-vtk-ink transition hover:border-vtk-navy/30"><span>{download.label}</span><span aria-hidden>↓</span></a></li>)}</ul>
            </section>
          ) : null}

          {item.isSet && item.setContents.length > 0 ? (
            <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
              <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">
                {en ? 'What is in the set' : 'Wat zit er in de set'}
              </h2>
              <ul className="mt-3 divide-y divide-vtk-navy/10">
                {item.setContents.map((content) => (
                  <li key={content.id} className="flex items-center justify-between gap-4 py-2 text-sm">
                    <span className="text-vtk-ink">{content.label}</span>
                    <span className="text-vtk-muted">{content.quantity}×</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {related.length > 0 ? (
            <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
              <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">
                {en ? 'Often requested together' : 'Vaak samen aangevraagd'}
              </h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {related.map((rel) => (
                  <li key={rel.id}>
                    <Link
                      href={`/materiaal/${rel.id}`}
                      className="flex items-center justify-between gap-3 rounded-[14px] border border-vtk-navy/10 px-4 py-2.5 text-sm transition hover:border-vtk-navy/25"
                    >
                      <span className="text-vtk-ink">{rel.name}</span>
                      <span aria-hidden className="text-vtk-muted">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="h-fit rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-vtk-muted">{en ? 'In stock' : 'In voorraad'}</dt>
              <dd className="font-medium text-vtk-ink">{item.quantity}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-vtk-muted">{en ? 'Deposit' : 'Waarborg'}</dt>
              <dd className="font-medium text-vtk-ink">
                {item.depositCents > 0 ? formatEuro(item.depositCents) : en ? 'None' : 'Geen'}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-sm leading-6 text-vtk-muted">
            {en
              ? 'Add this and other items to a request from the catalogue; availability is checked for your dates.'
              : 'Voeg dit en ander materiaal toe aan een aanvraag vanuit de catalogus; de beschikbaarheid wordt voor jouw periode gecheckt.'}
          </p>
          <Link
            href="/materiaal"
            className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-vtk-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-vtk-navy"
          >
            {en ? 'To the catalogue' : 'Naar de catalogus'}
          </Link>
        </aside>
      </div>
    </PageShell>
  );
}
