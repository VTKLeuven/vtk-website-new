# Rechtstreeks linken naar een deel van /account

`/account` heeft twee tabbladen: **Mijn VTK** en **Mijn gegevens**. Met een anker
in de URL open je meteen het juiste tabblad en scrolt de pagina naar het
onderdeel. Handig voor een mail, een andere VTK-site of een externe app die
iemand naar één plek op de accountpagina wil sturen:

```
https://vtk.be/account#tickets
https://vtk.be/en/account#study
```

Het werkt ook binnen de pagina: een link naar `#shifts` terwijl je op
`/account` staat, wisselt van tabblad zonder herladen (`hashchange`).

## Ondersteunde ankers

### Tabbladen

| Anker      | Opent                                     |
| ---------- | ----------------------------------------- |
| `#vtk`     | Tabblad Mijn VTK (dit is ook de standaard) |
| `#details` | Tabblad Mijn gegevens                      |

### Mijn VTK

| Anker               | Onderdeel                                   | Altijd zichtbaar?                          |
| ------------------- | ------------------------------------------- | ------------------------------------------ |
| `#membership`       | Lidmaatschap                                | ja                                         |
| `#tickets`          | Mijn tickets                                | ja                                         |
| `#mijn-vtk-tickets` | Mijn tickets (oud anker, zie onder)         | ja                                         |
| `#meetings`         | Vergaderingen (broodje voor de GM)          | enkel met een reservatie                   |
| `#theokot`          | Gereserveerde broodjes (Theokot)            | ja                                         |
| `#shifts`           | Mijn komende shiften                        | ja                                         |
| `#calendar`         | Agendafeeds (persoonlijke kalenderlinks)    | ja                                         |
| `#door`             | Deur-shortcut                               | enkel met recht op de deur                 |
| `#signature`        | E-mailhandtekening                          | enkel voor wie er een mag maken            |
| `#apps`             | Verbonden apps                              | ja                                         |

### Mijn gegevens

| Anker          | Onderdeel                                  |
| -------------- | ------------------------------------------ |
| `#preferences` | Accountvoorkeuren (taal)                   |
| `#password`    | Wachtwoord                                 |
| `#profile`     | Profielformulier (de hele kaart)           |
| `#identity`    | Profiel: naam en identiteit                |
| `#address`     | Profiel: adres                             |
| `#contact`     | Profiel: contactgegevens                   |
| `#study`       | Profiel: studie                            |
| `#photo`       | Profiel: profielfoto                       |
| `#privacy`     | Privacyrechten: gegevens downloaden en account verwijderen |

Een anker naar een onderdeel dat voor deze gebruiker niet getoond wordt (bv.
`#door` zonder dat recht), doet niets: de pagina opent gewoon op Mijn VTK. Een
onbekend anker ook.

`#mijn-vtk-tickets` is het oudere anker voor de tickets. Het blijft werken,
omdat de redirects in `apps/web/next.config.ts`, `/tickets`, de
bestelbevestiging en al verstuurde mails ernaar linken. Gebruik voor nieuwe
links `#tickets`.

## Hoe het werkt

- De ankers zijn gewone `id`'s op de kaarten in
  `apps/web/app/[locale]/account/page.tsx`. De vijf profielankers staan op de
  `fieldset`s in `apps/web/components/profile/ProfileForm.tsx`, die ook de
  onboarding gebruikt.
- `AccountTabs.tsx` zet beide panelen altijd in de DOM (het inactieve met
  `hidden`). Bij het laden en bij elke `hashchange` zoekt het het element met dat
  id, opent het tabblad waarin het staat en scrolt ernaar. Een nieuw anker
  vraagt dus geen code in `AccountTabs`: een `id` op het onderdeel volstaat.
- Geef een nieuw onderdeel `scroll-mt-28`, anders valt de kop onder de sticky
  header.

## Een onderdeel toevoegen of hernoemen

- **Hernoem of verwijder nooit een anker uit deze lijst.** Externe apps en
  verstuurde mails linken ernaar, en een verdwenen anker faalt stil: de pagina
  opent gewoon bovenaan. Hernoemen doe je door het oude id te laten staan op
  een wrapper, zoals `#tickets` rond `#mijn-vtk-tickets`.
- Zet een nieuw anker in de tabel hierboven. Kies een kort Engels woord in
  kleine letters, en let op dat het niet botst met een ander `id` op de pagina
  (de header en de footer staan er ook op).
