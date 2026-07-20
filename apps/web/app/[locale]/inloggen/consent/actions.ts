'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { oauthConsent } from '@vtk/auth/server';

const consentSchema = z.object({
  accept: z.boolean(),
  oauthQuery: z.string().min(1),
});

export type ConsentState = { error?: string; redirectTo?: string } | undefined;

/**
 * Geeft de bestemming terug in plaats van te redirecten: die ligt buiten deze
 * app (bij de client), dus moet de browser er echt naartoe navigeren.
 */
export async function consentAction(_prev: ConsentState, formData: FormData): Promise<ConsentState> {
  const parsed = consentSchema.safeParse({
    accept: formData.get('accept') === '1',
    oauthQuery: String(formData.get('oauthQuery') || ''),
  });
  if (!parsed.success) return { error: 'INVALID' };

  try {
    // Geen `scope`: toestemming geldt voor alle gevraagde scopes. Gedeeltelijke
    // toestemming komt in fase 3.
    const { url } = await oauthConsent(await headers(), {
      accept: parsed.data.accept,
      oauth_query: parsed.data.oauthQuery,
    });
    return { redirectTo: url };
  } catch {
    // Verwachte fout: verlopen of kapotte handtekening. Niet te repareren, de
    // gebruiker moet opnieuw vertrekken bij de externe applicatie.
    return { error: 'EXPIRED' };
  }
}
