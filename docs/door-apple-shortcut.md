# Apple Shortcut voor de deur

De Shortcut opent de deur niet rechtstreeks via SSH of Tailscale. De iPhone doet
een gewone HTTPS-call naar de publieke website; alleen de website-server praat
over Tailscale met de Raspberry Pi.

```text
iPhone Shortcut -> https://vtk.be -> website-server -> Tailscale -> Raspberry Pi
```

## Vereisten

- De gebruiker is actief en heeft op het moment van elke call het recht
  `door.remoteOpen` (rechtstreeks, via een rol of als superadmin).
- De Pi-listener en het gedeelde Pi-secret zijn geconfigureerd onder
  **Admin -> IT -> Door scanner**.
- De Pi draait `vtk_door_agent.py`; `POST /open` moet de opdracht onmiddellijk
  bevestigen met een 2xx-respons.

## Persoonlijk token aanmaken

1. Log in op `https://vtk.be/account`.
2. Open **Apple Shortcut voor de deur**. Dit blok is alleen zichtbaar met
   `door.remoteOpen`.
3. Geef het token een herkenbare naam, bijvoorbeeld `iPhone Jan`.
4. Klik **Token aanmaken** en kopieer de waarde meteen. Het ruwe token wordt maar
   één keer getoond; de database bewaart alleen de SHA-256-hash.

Een gebruiker kan maximaal vijf actieve tokens hebben. Elk token vervalt na 90
dagen en kan op dezelfde accountpagina onmiddellijk ingetrokken worden. Als de
gebruiker `door.remoteOpen` verliest of gedeactiveerd wordt, stoppen alle tokens
meteen met werken, ook als hun vervaldatum nog niet bereikt is.

## Shortcut bouwen op iPhone

1. Open **Opdrachten/Shortcuts** en maak een nieuwe opdracht.
2. Voeg eventueel eerst **Kies uit menu** toe met de bevestiging `Deur openen?`.
3. Voeg **Haal inhoud van URL op / Get Contents of URL** toe.
4. URL:

   ```text
   https://vtk.be/api/door/shortcut/open
   ```

5. Kies methode **POST**. Een lege JSON-dictionary als request body is voldoende.
6. Voeg deze HTTP-header toe:

   ```text
   Authorization: Bearer vtk_door_...
   ```

   Er staat exact één spatie tussen `Bearer` en het persoonlijke token.

7. Lees het JSON-resultaat. Bij succes is dit:

   ```json
   { "ok": true }
   ```

8. Voeg **Toon melding / Show Notification** toe. De opdracht kan daarna vanuit
   Shortcuts, Siri, een widget of een ondersteunde Action Button gestart worden.

Deel of exporteer een Shortcut met een ingevuld token niet. Wie het token kan
lezen, kan de deur openen tot het token ingetrokken is of vervalt.

## API-contract

`POST /api/door/shortcut/open` accepteert geen cookies, token in de querystring of
Pi-device-secret. Alleen een persoonlijk Bearer-token is geldig. Responses hebben
altijd `Cache-Control: no-store`.

| Status | JSON `error` | Betekenis |
|---|---|---|
| `200` | — | De Pi heeft de open-opdracht aanvaard. |
| `401` | `unauthorized` | Token ontbreekt, is ongeldig, ingetrokken of vervallen. |
| `403` | `forbidden` | Gebruiker is inactief of heeft `door.remoteOpen` niet meer. |
| `429` | `rate_limited` | Hetzelfde token werd minder dan vijf seconden geleden gebruikt. |
| `503` | `not_configured`, `unreachable` of `pi_error` | Website kan de Pi niet correct aanspreken. |

Een succesvolle call wordt in `DoorAccessLog` opgeslagen als `REMOTE` met
`reason=shortcut:<label>`. De atomaire cooldownclaim voorkomt dat twee snelle
Shortcut-runs allebei de Pi aanspreken.

## Beheer en incidenten

- **Verloren iPhone of gedeelde Shortcut:** trek het betreffende token meteen in
  via `/account`.
- **Token zichtbaar in chat, screenshot of log:** trek het in en maak een nieuw.
- **Recht ingetrokken:** geen aparte tokenactie nodig; live permissiecontrole
  blokkeert de volgende call.
- **Pi onbereikbaar:** test eerst de gewone remote-openknop. Shortcut en dashboard
  delen dezelfde server-naar-Pi-code.

## Deployment

De databasemigratie `20260721130000_door_shortcut_tokens` moet vóór of samen met
de webdeploy toegepast worden:

```bash
npm run migrate:deploy --workspace=@vtk/db
```

In productie gebruikt de deploypipeline normaal Prisma `migrate deploy`; maak de
database niet handmatig aan.
