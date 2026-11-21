/**
 * Wat er mis is wanneer Google Chat niet antwoordt, met wat eraan te doen is.
 * Het eerste gebruik van dit scherm loopt bijna altijd hierop: Chat vraagt
 * eigen scopes in de delegatie en een geconfigureerde Chat API in het
 * Cloud-project. Zie docs/google-workspace.md, "Chatruimtes".
 */
export function ChatSetupHelp({ nl, code, detail }: { nl: boolean; code: string; detail: string | null }) {
  const delegation = code === "CHAT_NOT_DELEGATED";
  return (
    <div className="space-y-2 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
      <p className="font-medium">
        {delegation
          ? nl
            ? "Google weigerde het aanmelden voor Chat."
            : "Google refused the Chat sign-in."
          : nl
            ? "Google Chat weigerde de vraag."
            : "Google Chat refused the request."}
      </p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>
          {nl
            ? "Zet de Google Chat API aan in het Cloud-project van het service-account, en vul op haar tabblad Configuratie een naam, avatar en beschrijving in (zonder die configuratie weigert Chat elke wijziging)."
            : "Enable the Google Chat API in the service account's Cloud project, and fill in a name, avatar and description on its Configuration tab (without it Chat refuses every change)."}
        </li>
        <li>
          {nl ? "Voeg deze scopes toe aan de domain-wide delegation van het service-account: " : "Add these scopes to the service account's domain-wide delegation: "}
          <code className="break-all">
            https://www.googleapis.com/auth/chat.admin.spaces,https://www.googleapis.com/auth/chat.admin.memberships
          </code>
          {nl ? ", en om te kunnen verwijderen ook " : ", and to be able to delete also "}
          <code className="break-all">https://www.googleapis.com/auth/chat.admin.delete</code>.
        </li>
        <li>
          {nl
            ? "De beheerder die het service-account impersoneert, moet het recht hebben om Chat-ruimtes te beheren (in een superadmin zit dat)."
            : "The admin the service account impersonates needs the privilege to manage Chat spaces (a super admin has it)."}
        </li>
      </ol>
      {detail ? <p className="text-xs opacity-80">Google: {detail}</p> : null}
    </div>
  );
}
