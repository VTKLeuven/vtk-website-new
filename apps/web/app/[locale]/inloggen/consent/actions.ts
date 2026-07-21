'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { oauthConsent } from '@vtk/auth/server';

const consentSchema = z.object({
  accept: z.boolean(),
  oauthQuery: z.string().min(1),
  scopes: z.array(z.string()),
});

export type ConsentState =
  { status: 'idle' } | { status: 'done'; redirectTo: string } | { status: 'error'; code: string };

/**
 * Geeft de bestemming terug in plaats van te redirecten: die ligt buiten deze
 * app (bij de client), dus moet de browser er echt naartoe navigeren. Ook bij
 * weigeren, want dan gaat het lid terug naar de client met `access_denied`.
 */
export async function consentAction(_prev: ConsentState, formData: FormData): Promise<ConsentState> {
  const parsed = consentSchema.safeParse({
    accept: formData.get('accept') === '1',
    oauthQuery: String(formData.get('oauthQuery') || ''),
    scopes: formData.getAll('scopes').map(String),
  });
  if (!parsed.success) return { status: 'error', code: 'INVALID' };

  try {
    const { url } = await oauthConsent(await headers(), {
      accept: parsed.data.accept,
      // Enkel meesturen bij toestaan. De plugin eist dat elke scope hier ook
      // oorspronkelijk gevraagd was, en weigert het verzoek anders volledig.
      ...(parsed.data.accept && parsed.data.scopes.length ? { scope: parsed.data.scopes.join(' ') } : {}),
      oauth_query: parsed.data.oauthQuery,
    });
    return { status: 'done', redirectTo: url };
  } catch (error) {
    // Verwachte fout: verlopen of kapotte handtekening. Niet te repareren, het
    // lid moet opnieuw vertrekken bij de externe applicatie.
    console.error('[sso] toestemming verwerken mislukt:', error);
    return { status: 'error', code: 'EXPIRED' };
  }
}
