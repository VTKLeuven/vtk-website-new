/**
 * Het paneel van /inloggen/geen-toegang, los van de pagina zodat
 * /admin/it/flows precies hetzelfde kan tonen.
 *
 * Drie redenen (zie `ClientAccessDenial` in packages/auth/src/server/clientAccess.ts):
 * de access-permissie ontbreekt, er is een KU Leuven-login nodig, of de
 * KU Leuven-login is geen studentenaccount. Bij de laatste twee staat er een
 * knop om via KU Leuven aan te melden (wie zowel een u- als een r-nummer heeft,
 * kan het met het tweede opnieuw proberen); bij een ontbrekende permissie niet,
 * want daar lost een nieuwe login niets op.
 */
import type { ClientAccessDenial } from '@vtk/auth/server';
import { KulSignInButton } from '@/app/[locale]/inloggen/KulSignInButton';

type KulRequirement = 'NONE' | 'LINKED' | 'STUDENT';

export function NoAccessPanel({
  nl,
  appName,
  reason,
  kulRequirement,
  kulLabel,
  resumeUrl,
}: {
  nl: boolean;
  appName: string | null;
  reason: ClientAccessDenial;
  kulRequirement: KulRequirement;
  /** De tekst van de KU Leuven-knop op /inloggen. */
  kulLabel: string;
  /** Waar de autorisatie na de KU Leuven-login verdergaat; `null` in een voorvertoning. */
  resumeUrl: string | null;
}) {
  const app = appName ?? (nl ? 'deze toepassing' : 'this application');

  const title = nl
    ? appName
      ? `Je hebt geen toegang tot ${appName}`
      : 'Je hebt geen toegang tot deze toepassing'
    : appName
      ? `You do not have access to ${appName}`
      : 'You do not have access to this application';

  return (
    <div className="vtk-auth-panel">
      <h1 className="vtk-auth-title">{title}</h1>

      {reason === 'permission' && (
        <>
          <p className="text-sm text-[#5c667f]">
            {nl
              ? 'Je bent aangemeld bij VTK, maar deze toepassing is enkel toegankelijk voor leden die er expliciet toegang toe kregen.'
              : 'You are signed in to VTK, but this application is only available to members who have explicitly been given access.'}
          </p>
          <p className="mt-3 text-sm text-[#5c667f]">
            {nl
              ? 'Denk je dat je hier wel bij moet kunnen? Vraag toegang aan bij de post die de toepassing beheert, of bij VTK IT.'
              : 'Think you should have access? Ask the group that manages the application, or VTK IT.'}
          </p>
        </>
      )}

      {reason === 'kul' && (
        <>
          <p className="text-sm text-[#5c667f]">
            {kulRequirement === 'STUDENT'
              ? nl
                ? `${app} is enkel voor studenten van de KU Leuven. Dat kunnen we enkel nagaan wanneer je via KU Leuven aanmeldt; met een wachtwoord of een account dat nog niet aan je KU Leuven-login hangt, lukt dat niet.`
                : `${app} is only for KU Leuven students. We can only check that when you sign in with KU Leuven; a password or an account not yet linked to your KU Leuven login does not tell us.`
              : nl
                ? `${app} vraagt een VTK-account dat aan een KU Leuven-login hangt, en het jouwe doet dat nog niet.`
                : `${app} needs a VTK account linked to a KU Leuven login, and yours is not linked yet.`}
          </p>
          <p className="mt-3 text-sm text-[#5c667f]">
            {nl
              ? 'Meld je eenmaal aan via KU Leuven. Je account wordt dan gekoppeld en je gaat meteen verder naar de toepassing.'
              : 'Sign in with KU Leuven once. Your account is then linked and you continue straight to the application.'}
          </p>
          <div className="mt-5">
            {resumeUrl ? (
              <KulSignInButton nextParam={resumeUrl} label={kulLabel} />
            ) : (
              <button type="button" className="vtk-auth-sso">
                {kulLabel}
              </button>
            )}
          </div>
        </>
      )}

      {reason === 'student' && (
        <>
          <p className="text-sm text-[#5c667f]">
            {nl
              ? `${app} is enkel voor studenten van de KU Leuven. Je laatste KU Leuven-login was geen studentenaccount (een r-nummer met een adres op student.kuleuven.be), bijvoorbeeld omdat je met een u-nummer van personeel aanmeldde.`
              : `${app} is only for KU Leuven students. Your last KU Leuven login was not a student account (an r-number with a student.kuleuven.be address), for instance because you signed in with a staff u-number.`}
          </p>
          <p className="mt-3 text-sm text-[#5c667f]">
            {nl
              ? 'Heb je ook een r-nummer? Meld je daarmee aan via KU Leuven en probeer opnieuw. Klopt dit niet, contacteer dan VTK IT.'
              : 'Do you also have an r-number? Sign in with it through KU Leuven and try again. If this is wrong, contact VTK IT.'}
          </p>
          <div className="mt-5">
            {resumeUrl ? (
              <KulSignInButton nextParam={resumeUrl} label={kulLabel} />
            ) : (
              <button type="button" className="vtk-auth-sso">
                {kulLabel}
              </button>
            )}
          </div>
        </>
      )}

      <p className="mt-6 text-sm">
        <a className="underline" href={nl ? '/' : '/en'}>
          {nl ? 'Terug naar vtk.be' : 'Back to vtk.be'}
        </a>
      </p>
    </div>
  );
}
