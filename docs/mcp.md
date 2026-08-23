# MCP-server voor coding agents

De website biedt een stateless Streamable HTTP MCP-endpoint op:

```text
POST /api/mcp
```

Hij is standaard uitgeschakeld. Zet `MCP_API_TOKEN` op een willekeurig geheim
van minstens 32 tekens en configureer daarnaast de serviceaccountrechten:

```dotenv
MCP_CLIENT_NAME="Codex productie"
MCP_PERMISSIONS="calendar.manageAll"
MCP_GROUP_CODES="CULTUUR,ONDERWIJS"
MCP_ROLE_CODES="editor"
```

Configureer minstens `MCP_PERMISSIONS` of `MCP_ROLE_CODES`. Rechten van de
bestaande databaserollen worden bij elke MCP-request opnieuw afgeleid en met de
directe allowlist samengevoegd. `MCP_PERMISSIONS="*"` geeft bewust alle
applicatiepermissies; gebruik dat alleen voor een afzonderlijke full-admin
credential. `MCP_ROLE_CODES="*"` doet in de praktijk hetzelfde: het neemt de
permissies van élke rol in de database over en koppelt élke rol als bewerkrol
aan nieuwe pagina's. Noem de rollen dus liever op. `MCP_GROUP_CODES="*"` laat
create-rechten voor elke groep toe; een corresponderend `*.manageAll`-recht
omzeilt die groepsgrens sowieso.

Stuur het token bij elke request als:

```http
Authorization: Bearer <MCP_API_TOKEN>
Content-Type: application/json
```

Een veilig token genereren:

```bash
openssl rand -base64 48
```

`MCP_CLIENT_NAME` bepaalt de actornaam in **Admin -> IT -> Logboek**.
`MCP_ROLE_CODES` bepaalt daarnaast welke rollen als bewerkrol aan nieuwe
CMS-pagina's worden gekoppeld. Gebruik een aparte credential en actornaam per
omgeving. Tokenrotatie gebeurt door de omgevingswaarde te vervangen en de
webservice opnieuw te starten.

## Toolgrens

De server gebruikt `packages/db/src/permissions.ts` als canonieke registry.
Elke permissie heeft in `lib/mcp/policy.ts` een expliciete MCP-policy met reads,
create-capabilities en geblokkeerde effecten. De typecheck faalt wanneer iemand
een applicatiepermissie toevoegt zonder die MCP-beslissing te maken.

Read-only:

- `system_list_capabilities` toont de effectieve serviceaccount, elke canonieke
  permissie, alle resources en alle create-kinds. Per veld komen ook het type,
  de enumwaarden, de lengte- en getalgrenzen, het formaat en de default mee,
  zodat een agent een create-call in één keer juist kan invullen;
- `app_read` leest permission-scoped data over de volledige applicatie:
  gebruikers en groepen, CMS, kalender, tickets, formulieren, foto's, POC's,
  partners, dashboard, shortlinks, shiften, Theokot, vergaderingen,
  lesbezoeken, piano, logistiek, deur, fakscanner, OAuth, vaultmetadata,
  auditlog, mailinglijsten en de 24UL-app. Resources die meerdere collecties in
  één antwoord bundelen (`theokot`, `piano`, `logistiek`, `door`, `fakscanner`,
  `module_access`, `vault_metadata`, `urenloop_app`, `mailing_lists`) hebben geen
  `id`- of `search`-filter en antwoorden `FILTER_NOT_SUPPORTED` in plaats van
  stilzwijgend alles terug te geven; blader daar met `limit` en `offset`;
- de bestaande kalender- en site-readtools blijven als handige, getypeerde
  aliases bestaan wanneer de serviceaccount het betrokken domein mag lezen.

Create-only:

- `app_create` ondersteunt `page`, `header_tab`, `header_link`, `announcement`,
  `poc`, `partner`, `calendar_event`, `calendar_category`, `ticket_event`,
  `ticket_type`, `ticket_question`, `ticket_gate`, `form`, `form_section`,
  `form_field`, `photo_album`, `group`, `role`, `dashboard_tile`, `short_link`,
  `shift`, `theokot_product`, `theokot_session`, `meeting`,
  `lesbezoek_organisation`, `lesbezoek`, `lesbezoek_peculiarity`,
  `piano_window`, `uitleen_category`, `uitleen_item`, `uitleen_event` en
  `oauth_client`;
- `calendar_create_event` en `calendar_create_category` blijven als backwards
  compatible aliases bestaan.

Er zijn bewust geen update-, upsert-, publish-, unpublish- of delete-tools en ook
geen tools die mail versturen, betalingen/refunds uitvoeren, bestellingen of
reservaties plaatsen, voorraad claimen, rechten uitdelen, wachtwoorden lezen,
tokens aanmaken of deuren openen.

Waar een model een veilige toestand heeft, forceert MCP die server-side:

- pagina's, kalender- en ticketevents, formulieren en fotoalbums starten als
  draft of ongepubliceerd;
- headertabs, partners, groepen, ticketonderdelen, Theokotproducten,
  Theokotsessies, pianovensters en logistieke catalogusrecords starten verborgen,
  inactief, gesloten of uitgeschakeld;
- OAuth-clients starten uitgeschakeld, publiek, zonder secret en met PKCE;
- formulier- en ticketevents krijgen alleen een managergrant voor hun bestaande
  eigenaarsgroep, nooit een nieuwe persoonlijke of globale grant.

Read-toegang volgt eveneens de bestaande rechten. Zo geeft `users.search` alleen
de minimale user-pickerdata, `shift.ranking` geen e-mailadressen, en
`lesbezoeken.view` alleen kalenderdata. Volledige ticketbestellingen,
formulierinzendingen, deurregistraties en gebruikersprofielen vereisen hun
zwaardere beheerrechten. OAuth-secrets, sessie-/bearertokens, credential-hashes,
Vaultwarden-wachtwoorden en gevoelige `Setting`-keys worden nooit teruggegeven,
ook niet met `MCP_PERMISSIONS="*"`. `editorial_settings` bouwt zijn sleutellijst
op uit de allowlist in `lib/mcp/read.ts`; een `key` uit de request zou die
allowlist overschrijven in plaats van ze te verfijnen, en `Setting` bevat ook
`s3.config`, `vault.config`, `door.config` en `brevo.lists`.

## Netwerkbeveiliging

- De endpoint valt dicht wanneer `MCP_API_TOKEN` ontbreekt of te kort is.
- De endpoint valt ook dicht wanneer zowel rollen als directe permissies
  ontbreken, wanneer een code onbekend is, of wanneer een geconfigureerde rol
  niet in de database bestaat.
- Bearer-tokens worden constant-time vergeleken en nooit doorgegeven aan tools.
- `Host` wordt beperkt tot `BETTER_AUTH_URL`, `VTK_MAIN_URL` en optionele
  `MCP_ALLOWED_HOSTS`.
- Browser-Origins moeten exact in dezelfde basis-URL's of
  `MCP_ALLOWED_ORIGINS` staan; CLI-clients zonder `Origin` blijven ondersteund.
- Requests zijn maximaal 256 KiB en standaard beperkt tot 120 requests per
  minuut per proces. Stel daarnaast een gedeelde limiet in op de reverse proxy
  wanneer er meerdere webreplica's draaien.
- Alle creaties verschijnen in het bestaande adminlogboek.

De bestaande VTK OAuth-provider wordt voorlopig niet als MCP-authorization
server gebruikt. Hij schakelt RFC 8707 resource-audiences bewust uit wegens een
upstream beveiligingsprobleem. Het MCP-token houdt die trust boundary apart in
plaats van de OAuth-configuratie te versoepelen.

## Vallen waar we in gelopen zijn

- **Een `key` uit de request hoort nooit in het `Setting`-filter.** Het filter
  stond als `{ key: { in: ALLOWLIST }, ...(id ? { key: id } : {}) }` geschreven;
  door de spread wint de laatste `key` en verdween de allowlist. Een account met
  enkel `openingHours.manageOwn` las daarmee `s3.config`. Bouw de sleutellijst
  op uit de allowlist en filter erbinnen.
- **Een menu-item mag naar een pad op deze site wijzen.** `header_link.url`
  valideer je met `isEditableDestination` uit `lib/href.ts`, net als
  `saveHeaderTabLink`. Met `z.string().url()` was `/praesidium` hier niet op te
  slaan terwijl de renderer dat al aankan; dat liep in de admin ooit al eens uit
  elkaar.
- **Een filter dat niets doet, is erger dan geen filter.** De gebundelde
  resources negeerden `search` stil en gaven een volledige lijst terug die er
  gefilterd uitzag. Ze antwoorden nu `FILTER_NOT_SUPPORTED`.
- **Validatiefouten uit gedeelde helpers moeten vertaald worden.**
  `parseShift` gooit een eigen `ShiftValidationError`; zonder vertaling naar
  `McpInputError` belandt een te vroege eindtijd als `INTERNAL_ERROR` in de
  monitoring in plaats van als leesbare melding bij de agent.

## Uitbreiden

Nieuwe mutaties moeten als expliciete `app_create`-kind klein en domeinspecifiek
blijven. Voeg nooit generieke database-, update- of delete-toegang toe. Een
nieuwe create-kind hoort:

1. server-side inputvalidatie en kleine, expliciete velden te hebben;
2. alleen `find*` en `create` in de MCP data access layer te gebruiken;
3. referenties vooraf te controleren;
4. een `logSystemAudit`-regel te schrijven;
5. `destructiveHint: false` en `idempotentHint: false` te declareren;
6. een mapping in `MCP_PERMISSION_POLICY` en tests te krijgen.
