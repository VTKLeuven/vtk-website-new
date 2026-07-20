import Image from 'next/image';
import Link from 'next/link';
import { copy, getLocale } from '@/lib/i18n';

const MAIN_URL = process.env.VTK_MAIN_URL || 'https://vtk.be';

/* Sessies zijn gedeeld via het .vtk.be-cookie: na inloggen op de hoofdsite is
   het lid hier meteen ook ingelogd. */
type LoginVariant =
  | 'default'
  | 'material'
  | 'item'
  | 'reservations'
  | 'reservation'
  | 'van'
  | 'trip'
  | 'flesserke'
  | 'manage';

const VARIANT_KEY = {
  default: 'loginDefault',
  material: 'loginMaterial',
  item: 'loginItem',
  reservations: 'loginReservations',
  reservation: 'loginReservation',
  van: 'loginVan',
  trip: 'loginTrip',
  flesserke: 'loginFlesserke',
  manage: 'loginManage',
} as const;

export async function LoginGate({ variant = 'default' }: { variant?: LoginVariant }) {
  const locale = await getLocale();
  const t = copy[locale];
  const message = t[VARIANT_KEY[variant]];
  return (
    <main className="logistics-auth mx-auto grid w-full flex-1 place-items-center px-5 py-12">
      <section className="logistics-auth-panel w-full max-w-xl">
        <Image src="/VTK.png" alt="" width={660} height={777} className="h-14 w-auto" />
        <p className="mt-7 text-sm text-vtk-muted">{t.loginKicker}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-vtk-ink">{t.loginTitle}</h1>
        <p className="mt-4 leading-7 text-vtk-body">{message}</p>
        <Link href={`${MAIN_URL}/inloggen`} className="logistics-login-button mt-7">
          {t.loginAction} <span aria-hidden>→</span>
        </Link>
      </section>
    </main>
  );
}
