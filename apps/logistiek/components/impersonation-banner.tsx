import { getImpersonation } from '@/lib/session';
import { getLocale } from '@/lib/i18n';
import { logoutTestUser } from '@/app/test-login/actions';

/**
 * "Je bekijkt als iemand anders", op elke pagina.
 *
 * Wisselen van test-profiel was tot nu onzichtbaar: je klikte een persona aan,
 * belandde op de home, en niets op het scherm zei nog dat je Alice was. Wie het
 * vergat, testte een half uur lang de rechten van iemand anders, en terugkeren
 * betekende eerst `/test-login` terugvinden.
 *
 * Vandaar deze strook bovenaan: ze zegt als wie je kijkt en zet de weg terug op
 * één klik. Boven de sitekop en niet erin, zodat ze ook meegaat op de schermen
 * die hun eigen kop tekenen (de beheeromgeving, het intekenraster op een
 * telefoon).
 */
export async function ImpersonationBanner() {
  const impersonation = await getImpersonation();
  if (!impersonation) return null;

  const locale = await getLocale();
  const nl = locale === 'nl';

  return (
    <div className="impersonation-bar">
      <p className="impersonation-bar-text">
        <span aria-hidden>👤</span>{' '}
        {nl ? 'Je bekijkt als' : 'You are viewing as'}{' '}
        <strong>{impersonation.personaName}</strong>
        {impersonation.real ? (
          <span className="impersonation-bar-real">
            {' '}
            ({nl ? 'jij bent' : 'you are'} {impersonation.real.user.name})
          </span>
        ) : null}
      </p>
      <form action={logoutTestUser}>
        <button type="submit" className="impersonation-bar-button">
          {nl ? 'Terug naar mijn account' : 'Back to my account'}
        </button>
      </form>
    </div>
  );
}
