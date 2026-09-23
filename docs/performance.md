# Performance van vtk.be

Wat de site traag of zwaar maakte, wat eraan gedaan is, en wat je niet opnieuw
moet invoeren. De meetpunten komen uit de Web Vitals in Umami (enkel bezoekers
die statistieken toestonden), uit Playwright met een gesimuleerde telefoon
(trage 4G, 4x tragere CPU) en uit de productieserver zelf.

---

## In één oogopslag

| Wat | Voor | Na |
|---|---|---|
| JavaScript op de homepage (gzip) | 402 KB | 222 KB |
| JavaScript op /kalender | 395 KB | 219 KB |
| JavaScript op een contentpagina | 407 KB | 231 KB |
| Hero-foto op mobiel | 1,5 MB (JPEG, CSS-achtergrond) | 287 KB (WebP, preload) |
| Fonts die elke pagina vooraf laadt | 5 (130 KB) | 2 |
| Prefetches per paginaweergave | 13 tot 42 | 0 tot er iemand een link aanwijst |
| CLS op /kalender (p75 laptop, echte bezoekers) | 0,54 | de pagina rendert de eerste maand al op de server |

---

## Wat er gedaan is, en waarom

### De eerste weergave komt van de server (`/kalender`, `/shift`)

Beide pagina's renderden eerst leeg ("Geen evenementen deze maand") en vulden
zich na een fetch in de browser. De footer sprong daarbij honderden pixels naar
beneden: een CLS van 0,8 op /kalender. De server geeft nu de evenementen van de
openingsweergave mee (`loadOpeningCalendarEvents`) en de shiftlijsten
(`lib/shift/lists.ts`); de API-routes gebruiken dezelfde functies.

### Prefetch pas bij hover of aanraking (`components/ui/Link.tsx`)

Elke pagina hier is dynamisch (de root layout leest cookies). Een prefetch van
een dynamische route zonder `loading.js` levert in Next 16 weinig op, want de
data wordt niet gecachet en de klik rendert de pagina toch opnieuw. De server
betaalde wel: 150 à 200 ms render per prefetch, en de header, footer en kaarten
samen gaven 13 tot 42 prefetches per paginaweergave. Alle links in `apps/web`
gebruiken daarom `@/components/ui/Link`, die pas prefetcht wanneer iemand de
link aanwijst, aanraakt of er met het toetsenbord op komt.

### Sentry pas na toestemming (`lib/sentryClient.ts`)

De SDK met Replay is 153 KB gzip (497 KB JavaScript om te parsen). Statisch
geïmporteerd kwam ze op elke pagina, ook bij wie nooit toestemming gaf en bij
wie Sentry dus nooit start. Nu laadt `instrumentation-client.ts` haar met een
dynamische import, en start de cookiebanner haar op het moment van toestemming.

### De cookiebanner rendert op de server en herlaadt niet meer

De banner verscheen pas na de hydration en werd bij een eerste bezoek het late
LCP-element. Nu leest de root layout de cookie en rendert de banner meteen.
"Enkel noodzakelijk" en "toestaan" herladen de pagina niet meer; enkel het
intrekken van toestemming doet dat nog, want Sentry en Umami zijn niet netjes
te stoppen.

### Woordenboeken en markdown enkel waar nodig

Beide woordenboeken (~40 KB gzip) en de markdown-renderer (~43 KB) stonden op
elke pagina. Oorzaken en oplossingen:

- `@vtk/i18n` was een barrel: `pick` en `LOCALES` zaten in hetzelfde bestand
  als de woordenboeken. De woordenboeken staan nu in een eigen module
  (`dictionaries.ts`), het package is `"sideEffects": false`, en
  `optimizePackageImports` in `next.config.ts` laat de bundler enkel laden wat
  gebruikt wordt.
- Clientcomponenten in de gedeelde bundel die `getDictionary` riepen
  (`PageGallery`, `FeedbackDialog`, `FrontpageShiftBand`) krijgen hun labels nu
  van de server of laden pas wanneer ze openen.
- `Markdown` wordt in clientcomponenten via `next/dynamic` geladen.

### Hero-foto via `next/image` (`HomeHeroPhoto`)

Als CSS-achtergrond ontdekte de browser de foto pas na de CSS en kreeg hij het
origineel. Nu staat er een preload in de `<head>` en komt er een WebP van de
juiste breedte.

### Timeouts op externe fetches

Zonder grens wacht `fetch` tot vijf minuten op een antwoord. Een hangende
cudi.vtk.be hield zo de homepage vast, een hangende Immich /media. Elke externe
aanroep heeft nu een timeout; bij Immich enkel tot de headers binnen zijn,
zodat een groot origineel mag doorstromen.

---

## Wat nog op de server moet gebeuren

Deze stappen zitten niet in de repo: ze vragen root of een beslissing.

### Compressie naar Caddy

Next comprimeert nu zelf met gzip, op hetzelfde event loop dat de pagina's
rendert (de log toont `MaxListenersExceededWarning ... [Gzip]`). Caddy doet het
in Go op andere cores, en met zstd. In `/etc/caddy/Caddyfile`:

```caddy
vtk.be www.vtk.be {
	encode zstd gzip
	reverse_proxy localhost:3011
}
```

Zet daarna `NEXT_COMPRESSION=off` in de root-`.env` en herstart `web`; anders
comprimeert Next eerst en krijgt Caddy al gecomprimeerde bytes.

### Een toegangslog voor vtk.be, tijdelijk

De server rendert veel meer dan er bezoekers zijn: de query van de
evenementpagina liep 18 keer per seconde terwijl Umami een paar pageviews per
minuut telde. De prefetches verklaren een deel; voor de rest is een log nodig
(crawlers?). Zet een paar dagen dit in hetzelfde blok en kijk welke user-agents
en paden de hoofdmoot zijn:

```caddy
	log {
		output file /var/log/caddy/vtk-access.log {
			roll_size 50MiB
			roll_keep 3
		}
		format filter {
			wrap json
			fields {
				request>headers>Cookie delete
				request>headers>Authorization delete
				request>remote_ip delete
				request>client_ip delete
			}
		}
	}
```

### Logrotatie voor Postgres, Immich en Vaultwarden

`infra/docker-compose.yml` begrenst de logs van de apps en workers. Voor de
andere containers hoort het in `/etc/docker/daemon.json`, omdat een andere
logconfig in compose ze bij de volgende deploy opnieuw zou maken:

```json
{ "log-driver": "json-file", "log-opts": { "max-size": "20m", "max-file": "5" } }
```

---

## Vallen waar we in gelopen zijn

- **Een statische import van `@sentry/nextjs` in een clientbestand zet de hele
  SDK terug op elke pagina.** Ook in `global-error.tsx` en `error.tsx`: dat
  zijn root-bestanden. Gebruik `startSentry()` of een dynamische import.
- **`getDictionary` in een clientcomponent trekt beide woordenboeken mee**, en
  de bundler groepeert clientcomponenten van de layout in gedeelde chunks: één
  zo'n component in de header en ze staan op elke pagina. Geef labels mee van
  de server, zoals de albumpagina en `PageGallery` doen.
- **Een zwaar clientcomponent statisch importeren waar het zelden rendert**
  (markdown in een formulierveld, een dialoog achter een klik) zet het in een
  chunk naast `Link`, en dus op elke pagina. Gebruik `next/dynamic`.
- **Een eerste weergave die leeg rendert en zich in de browser vult, springt.**
  Geef de eerste data mee van de server.
- **`next/link` rechtstreeks importeren** zet de viewport-prefetch terug. Gebruik
  `@/components/ui/Link`.
- **Meten doe je op een productiebuild**, niet op `next dev`: dev splitst de
  bundels anders. `npx next build && npx next start -p 3005`, en tel de scripts
  in de HTML.
