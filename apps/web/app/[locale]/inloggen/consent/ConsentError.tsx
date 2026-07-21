/**
 * Foutschermen voor de toestemmingspagina (13.8).
 *
 * Geen enkele variant stuurt door naar de `redirect_uri`: op dit punt is die
 * niet te vertrouwen, want de handtekening die hem dekt is net het probleem.
 * Een onbekende client krijgt dezelfde tekst als een verlopen aanvraag, zodat
 * dit scherm nooit verklapt of een client_id bestaat.
 */
export function ConsentError({ nl, kind }: { nl: boolean; kind: 'expired' | 'disabled' }) {
  const title =
    kind === 'disabled'
      ? nl
        ? 'Deze toepassing is uitgeschakeld'
        : 'This application is disabled'
      : nl
        ? 'Deze aanvraag is verlopen of ongeldig'
        : 'This request has expired or is invalid';

  const body =
    kind === 'disabled'
      ? nl
        ? 'Neem contact op met VTK IT als je denkt dat dit een vergissing is.'
        : 'Contact VTK IT if you think this is a mistake.'
      : nl
        ? 'Start opnieuw vanuit de toepassing die je hierheen stuurde.'
        : 'Start again from the application that sent you here.';

  return (
    <div className="vtk-auth">
      <div className="vtk-auth-panel">
        <h1 className="vtk-auth-title">{title}</h1>
        <p className="text-sm text-[#5c667f]">{body}</p>
      </div>
    </div>
  );
}
