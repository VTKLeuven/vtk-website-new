# De VTK-app ontwikkelen

De app staat in **`mobile/`**. Dit document is de handleiding: opzetten, draaien
op je telefoon, en uitrollen. Wat de app met de site praat staat in
[`app-api.md`](./app-api.md); de afspraken in de code staan in
`mobile/AGENTS.md`.

## Waarom `mobile/` en niet `apps/`

Alles onder `apps/*` en `packages/*` wordt automatisch een **npm-workspace**.
Voor de app is dat precies wat je niet wil: dan worden zijn dependencies (React
Native, honderden pakketten) samengevoegd met die van de website, en zou de
lockfile van de hele repo opnieuw moeten worden opgelost. Dat laatste is hier een
bekende val, want een schone resolve laat `better-auth` doorschuiven en breekt
`packages/auth` (zie `AGENTS.md`).

`mobile/` valt buiten die globs. De app heeft dus **zijn eigen `node_modules` en
zijn eigen lockfile**, en de website merkt niets van hem. `mobile/metro.config.js`
sluit de `node_modules` van de website expliciet af, zodat een ontbrekende
dependency een duidelijke fout geeft in plaats van stilletjes de verkeerde versie
op te pikken.

## Eén keer opzetten

```bash
npm run app:install      # of: npm install --prefix mobile
```

`npm install` in de wortel doet dit **niet**: de app is geen workspace. Dat is de
prijs van de isolatie hierboven, en de enige die je betaalt.

## Draaien op je telefoon

Je hebt twee dingen tegelijk nodig: **de app** (de JavaScript, uit Metro) en **de
site** (de gegevens, uit `apps/web`). Die twee staan los van elkaar.

### 1. De site

```bash
npm run dev              # apps/web op http://localhost:3000
```

Een telefoon kan niet aan `localhost`, en de weblogin heeft bovendien HTTPS nodig
(KU Leuven-SSO weigert anders). Zet er dus een tunnel voor:

```bash
cloudflared tunnel --url http://localhost:3000
```

Dat geeft een adres als `https://iets-willekeurigs.trycloudflare.com`. Onthoud
het; je vult het straks in de app in. Het adres verandert bij elke herstart.

### 2. De app

```bash
npm run app              # of: npm start --prefix mobile
```

Metro start en toont een QR-code. Op hetzelfde wifi-netwerk volstaat dat; zit je
telefoon ergens anders, gebruik dan `npx expo start --tunnel` vanuit `mobile/`.

### 3. In Expo Go

Installeer **Expo Go** uit de App Store of Play Store en scan de QR-code. Voor
Android bestaat er ook een gebouwde APK (zie *Uitrollen*), maar voor iOS is Expo
Go voorlopig de enige weg: een build op een echte iPhone vraagt een Apple
Developer-account, en dat is er nog niet.

### 4. De server instellen

Open in de app **Meer → je naam → Server** en vul je cloudflared-adres in. Zonder dat
praat de app met `https://dev.vtk.be`, en dan test je de productiegegevens in
plaats van je eigen werk.

Het wisselen gooit de leescache weg. Dat is met opzet: inhoud van de ene server
op de andere tonen levert schermen op die iets beweren dat er niet is.

## Wat er niet werkt in Expo Go

- **Pushberichten.** Sinds SDK 53 ondersteunt Expo Go geen remote push meer; de
  knop in Profiel zal falen. Alles daarbuiten werkt wel. Wil je push echt testen,
  dan heb je een development build nodig.
- **Een build op een iPhone**, om de reden hierboven.

## Nakijken voor je pusht

```bash
npm run app:check        # tsc --noEmit en eslint in mobile/
```

De pre-push-hook draait `npm run verify` voor de **website**; de app zit daar
bewust niet in, want die checks vragen een aparte `node_modules`. Draai
`app:check` dus zelf wanneer je aan de app gewerkt hebt.

Eén ding raakt allebei: `apps/web/lib/app-api/contract.ts` wordt letterlijk
gekopieerd naar `mobile/src/api/contract.ts`. Er staat een test op
(`apps/web/test/appApiContract.test.ts`) die de twee byte voor byte vergelijkt,
en die faalt in `npm run verify` zodra ze uit de pas lopen. **Wijzig je het
contract, kopieer het dan mee.**

## Uitrollen

De app draait op **EAS**, onder het account `vtk-it`, project `vtk-app`.

```bash
cd mobile
npx eas-cli@latest update --branch preview --message "wat je veranderd hebt"
```

Dat is genoeg voor JavaScript en assets: die gaan over de lucht naar elk toestel
dat de app al heeft.

**Een nieuwe native dependency gaat er niet over.** Dan is er een nieuwe build
nodig:

```bash
npx eas-cli@latest build --profile preview --platform android
```

`runtimeVersion` staat op `"exposdk:54.0.0"`, en die waarde is dezelfde voor élke
SDK 54-build. Een update bereikt dus ook toestellen met een oudere APK, ook
wanneer de JavaScript erin een module importeert die daar niet in zit; dat geeft
een rood scherm op het moment dat zo'n scherm laadt. Bouw daarom eerst, verspreid
de APK, en zeg erbij dat wie een oudere versie heeft moet herinstalleren. Zie
`mobile/docs/architecture.md` voor waarom die policy hier toch de juiste is, en
wanneer ze op fingerprint moet.

De volgorde die klopt:

1. `npx eas-cli@latest build --profile preview --platform android`
2. de APK verspreiden (de link uit de build, of de QR), met de vraag om de vorige
   te vervangen
3. `npx eas-cli@latest update --branch preview --message "..."` voor alles wat
   daarna nog aan de JavaScript verandert

Wijzigde er niets aan de native kant, dan volstaat stap 3 alleen.

Let op de bekende valstrik: een OTA-update wordt op de ene start **gedownload** en
op de volgende pas **toegepast**. De app moet dus twee keer dicht en open voor je
oordeelt over wat je ziet.

## Op een iPhone

Er is **geen Apple Developer-account**, dus EAS kan geen iOS-build maken en er is
er ook nooit een geweest. De weg naar een iPhone loopt daarom via **Expo Go**:

1. Expo Go installeren uit de App Store.
2. Inloggen met het `vtk-it`-account.
3. Het project `vtk-app` openen; Expo Go laadt de laatste update van het
   `preview`-kanaal.

Daarvoor is geen dev server nodig en er hoeft niets gebouwd te worden: een
`eas update` volstaat, want Expo Go draait op `exposdk:54.0.0`. Wat er niet werkt
is push, want Expo Go verstuurt sinds SDK 53 geen pushberichten meer; daarvoor
heb je een echte build nodig.

## De kanalen

`development`, `preview` en `production`, ingesteld in `mobile/eas.json`. Er wordt
vandaag enkel naar `preview` gepubliceerd; dat is het kanaal waar de APK van het
bestuur op zit.

## Waar wat staat

| Map | Wat |
|---|---|
| `mobile/app/` | De routes (expo-router). De vijf tabs in `(tabs)/`, alle doorklikschermen in `(tabs)/(detail)/`. |
| `mobile/src/api/` | De HTTP-laag en het contract met de site. |
| `mobile/src/components/` | Gedeelde UI. |
| `mobile/src/theme/tokens.ts` | De kleuren, overgenomen uit `apps/web/app/design/vtk-base.css`. |
| `mobile/docs/plan.md` | Het plan en het logboek: welke fase waar staat. |
