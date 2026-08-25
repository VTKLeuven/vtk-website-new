import { apiFetch, appApi } from './client';
import type { AppBootstrap, AppLocale, AppPushRegisterInput } from './contract';

/** Wat de app bij elke start ophaalt; zie `docs/app-api.md` in vtk-website-new. */
export function fetchBootstrap(locale: AppLocale): Promise<AppBootstrap> {
  return apiFetch<AppBootstrap>(appApi('/bootstrap', { locale }));
}

export function registerPushToken(input: AppPushRegisterInput): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(appApi('/push/register'), { method: 'POST', body: input });
}

export function unregisterPushToken(token: string): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(appApi('/push/unregister'), { method: 'POST', body: { token } });
}
