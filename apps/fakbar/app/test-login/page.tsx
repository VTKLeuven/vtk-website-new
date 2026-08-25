import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ensureTestUser, isTestUserKey, TEST_USER_COOKIE } from '@/lib/test-users';

export default async function TestLoginPage() {
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-8">
      <div className="max-w-sm w-full">
        <h1 className="text-2xl font-bold mb-2">Test Login</h1>
        <p className="text-sm text-gray-400 mb-6">Enkel beschikbaar in lokale dev.</p>
        <div className="flex flex-col gap-3">
          <form action={loginAsFakbar}>
            <button type="submit" className="w-full px-4 py-3 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 transition text-left">
              🍺 Alice — Fakbar lid (beheer)
            </button>
          </form>
          <form action={loginAsIT}>
            <button type="submit" className="w-full px-4 py-3 bg-white/10 text-white font-semibold rounded-lg hover:bg-white/20 transition text-left">
              🔧 Bob — IT superadmin
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

async function loginAs(key: string) {
  'use server';
  if (!isTestUserKey(key)) return;
  await ensureTestUser(key);
  (await cookies()).set(TEST_USER_COOKIE, key, { path: '/', maxAge: 60 * 60 * 24 });
  redirect('/admin');
}

async function loginAsFakbar() {
  'use server';
  await loginAs('fakbar');
}

async function loginAsIT() {
  'use server';
  await loginAs('it');
}
