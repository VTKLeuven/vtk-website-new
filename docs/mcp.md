# MCP-server voor coding agents

De website biedt een stateless Streamable HTTP MCP-endpoint op:

```text
POST /api/mcp
```

Hij is standaard uitgeschakeld. Zet `MCP_API_TOKEN` op een willekeurig geheim
van minstens 32 tekens en stuur het bij elke request als:

```http
Authorization: Bearer <MCP_API_TOKEN>
Content-Type: application/json
```

Een veilig token genereren:

```bash
openssl rand -base64 48
```

`MCP_CLIENT_NAME` bepaalt de actornaam in **Admin -> IT -> Logboek**. Gebruik
bij voorkeur een aparte token en actornaam per omgeving. Tokenrotatie gebeurt
door de omgevingswaarde te vervangen en de webservice opnieuw te starten.

## Toolgrens

De server exposeert alleen expliciet geregistreerde tools. Er is geen raw SQL,
generieke Prisma-toegang, bestandssysteem, shell of deploy-tool.

Read-only:

- `calendar_list_events` en `calendar_get_event`
- `calendar_list_categories` en `calendar_get_category`
- `calendar_list_groups`
- `site_list_pages` en `site_get_page`
- `site_list_navigation`
- `site_list_partners`
- `site_list_announcements`

Create-only:

- `calendar_create_event`
- `calendar_create_category`

Er zijn bewust geen update-, upsert-, publish-, unpublish- of delete-tools.
Een event wordt standaard als concept aangemaakt; `publish: true` moet expliciet
worden meegegeven om het meteen zichtbaar te maken. Categorieën zijn altijd
gewone themacategorieën: de MCP-server kan geen doelgroepcategorie aanmaken.

De read-tools beperken zich tot redactionele websitegegevens. Ze geven geen
leden, sessies, rollen, bestellingen, betalingen, formulierinzendingen,
deurregistraties, OAuth-clients of `Setting`-waarden terug. Vooral `Setting` mag
niet generiek leesbaar worden: die tabel bevat ook versleutelde en operationele
configuratie.

## Netwerkbeveiliging

- De endpoint valt dicht wanneer `MCP_API_TOKEN` ontbreekt of te kort is.
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

## Uitbreiden

Nieuwe mutaties moeten klein en domeinspecifiek blijven. Voeg nooit een
generieke database-, update- of delete-tool toe. Een nieuwe create-tool hoort:

1. server-side inputvalidatie en kleine, expliciete velden te hebben;
2. alleen `find*` en `create` in de MCP data access layer te gebruiken;
3. referenties vooraf te controleren;
4. een `logSystemAudit`-regel te schrijven;
5. `destructiveHint: false` en `idempotentHint: false` te declareren;
6. tests te krijgen die de toolnaam en create-only databasecall vastleggen.
