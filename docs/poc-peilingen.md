# POC-peilingen

De RiVers vragen de studenten van hun richting om hun mening, op de homepage en op
Discord. De kringkeuzes staan in `docs/design-decisions.md`, "POC-peilingen".

## Hoe het loopt

1. Een RiVer stelt een peiling op in `/admin/peilingen`: 1 tot 5 vragen (ja of nee,
   score van 1 tot 5, open), een deadline, optioneel de datum van de POC, de fases
   en of ze ook in het Discord-kanaal van de POC komt.
2. Publiceren opent de peiling meteen. De vragen liggen dan vast.
3. Studenten met een richting van die POC zien een gele strook bovenaan elke pagina
   (`PocPollStrip`). De vragen staan in de POC-band op de homepage, op het anker
   `#peiling`.
4. Tijdens de looptijd zien de RiVers enkel de deelname. Na de deadline verschijnen
   de cijfers, per fase te filteren.
5. Na de POC publiceren de RiVers een samenvatting, die 30 dagen bij de POC staat.

## Discord instellen

De kalender post met webhooks, maar die kunnen geen knoppen met een actie sturen.
De peilingen hebben daarom een eigen applicatie. Zonder de drie variabelen hieronder
staan de peilingen gewoon enkel op de website.

1. Maak een applicatie in het [Discord Developer Portal](https://discord.com/developers/applications).
   Naam: `VTK Peilingen`, avatar: `apps/web/public/vtk-discord-avatar.png`.
2. Zet de **Public Key** in `DISCORD_PUBLIC_KEY` en de token onder **Bot** in
   `DISCORD_BOT_TOKEN`, in de `.env` van de server.
3. Zet het id van de studentendiscord in `DISCORD_GUILD_ID` (ontwikkelaarsmodus,
   rechtsklik op de server, Server-ID kopiëren).
4. Nodig de bot uit op die server met de permissies View Channels, Send Messages en
   Manage Roles, via OAuth2 URL Generator met de scope `bot`.
5. Sleep in de serverinstellingen de rol van de bot **boven** alle POC-rollen. Een
   bot kan geen rol uitdelen die hoger staat dan zijn eigen rol.
6. Deploy, en zet daarna bij **Interactions Endpoint URL**:
   `https://vtk.be/api/discord/interactions`. Discord test die meteen; een fout hier
   betekent bijna altijd dat `DISCORD_PUBLIC_KEY` niet klopt of nog niet gedeployed is.

Per POC komt er een rol en een kanaal op de server:

1. Maak een rol, bv. `POC Computerwetenschappen`.
2. Maak een kanaal waarin `@everyone` View Channel niet heeft en die rol en de bot
   wel. Dat zet Discord zelf, niet de site.
3. Kies de rol en het kanaal in `/admin/pocs`, onder POC-instellingen.

Zet tot slot in `/admin/pocs` het koppelbericht in een publiek kanaal. Daar staat de
knop waarmee studenten hun account koppelen.

Een kanaal waar de bot niet in mag, geeft na het publiceren een foutmelding op het
scherm van de peiling, met een knop om opnieuw te posten.

## Zo werkt het op Discord

- Discord kan een bericht niet tot bepaalde mensen beperken; zichtbaarheid hangt aan
  het kanaal. Daarom krijgt elke POC een eigen kanaal, en bepaalt de rol wie erin kan.
- Wie op de knop onder het koppelbericht drukt, krijgt een link naar `/koppel-discord`.
  Discord zegt welk account klikte, de aanmelding op de site wie dat is. Daarna geeft
  de bot de rol van elke POC waarvan de richting op het account staat. Ontkoppelen kan
  op `/account` en haalt de rollen weer weg.
- De rol volgt het account. De worker (`/api/background/maintenance`) vergelijkt elke
  vijf minuten wat er hoort te staan (`lib/discord/pocRoles.ts`) met wat de site al
  uitdeelde (`User.discordRoleIds`). Een andere richting, een nieuwe rol in
  `/admin/pocs` of het begin van een academiejaar loopt dus vanzelf mee. Wie de studie
  niet bevestigde, verliest de rol tot dat wel gebeurd is.
- Publiceert een RiVer een peiling, dan komt ze in het kanaal van de POC. Eén ja/nee-vraag
  of score staat met knoppen in het kanaal. Al de rest start met één knop en loopt vraag
  per vraag in berichten die enkel de klikker ziet. Een open vraag opent een pop-up.
- Bij elke klik kijkt de site opnieuw na of de peiling voor dit account is, want een
  peiling kan voor maar één fase zijn en een rol weet niets van fases.
- De worker zet de knoppen uit na de deadline.
- Elk antwoord staat in dezelfde tabel als op de website: wie op beide antwoordt, telt
  één keer.
- Voorvertoningen van alle berichten staan op `/admin/it/flows`.

## Lokaal proberen

`npm run db:demo:peiling` zet een open voorbeeldpeiling klaar bij de eerste POC met een
richting en RiVers. Na hoogstens een minuut verschijnt ze, door de gedeelde cache. Met
`-- --reset` ruim je ze weer op.

## Vallen

- **Geen `userId`, eigen id of tijdstempel op `PocPollAnswer`.** Een cuid bevat een
  tijdstip, en een tijdstip is aan de toegangslogs te koppelen. `voterKey` is een HMAC;
  wie zowel de database als `BETTER_AUTH_SECRET` heeft, kan die voor een gekende
  gebruiker wel narekenen. Roteer je `BETTER_AUTH_SECRET` tijdens een open peiling, dan
  kan iedereen opnieuw antwoorden.
- **Een POC zonder `studyProgrammes` kan niet publiceren**, want dan is er niemand aan
  wie de site de peiling kan tonen. Stel de richtingen in op `/admin/pocs`.
- **De strook beslist in de client of ze past bij de pagina.** De layout hertekent niet
  bij een navigatie binnen de site, dus wat de server over het pad wist, klopt na de
  eerste klik niet meer.
- **Discord wil binnen drie seconden antwoord.** Doe in `pollInteractions.ts` niets dat
  lang kan duren. Rollen veranderen gebeurt daarom in `after()`.
- **Geef een gekoppeld lid een POC-rol niet met de hand.** De worker haalt een rol weg
  die de site al uitdeelde en die niet meer past. Moderatoren krijgen toegang tot die
  kanalen met hun eigen rol.
- **De worker ziet niet wie de server verliet en terugkwam.** Volgens `discordRoleIds`
  heeft dat lid de rol nog. Daarom herstelt een klik op het koppelbericht de rollen op
  basis van wat Discord meestuurt.
- **Rollen geven dat mislukt, staat op `/admin/pocs`.** Bijna altijd staat de rol van
  de bot onder een POC-rol, of ontbreekt Manage Roles.
- **De open peilingen staan een minuut in de gedeelde cache** (`getCachedOpenPocPolls`).
  Acties in het beheer duwen de tag om; een script of een wijziging in de database niet.
