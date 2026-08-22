# Wachtwoordkluis (Vaultwarden)

Gedeelde wachtwoorden per post, beheerd in de VTK-admin en gebruikt in de gewone
Bitwarden-clients. Dit document beschrijft wat er staat en waarom. Voor de
kringkeuzes (welke posten, wat er bij uitstroom gebeurt, waarom Vaultwarden en
niet Passbolt) zie `docs/design-decisions.md`; voor het rollen- en
permissiemodel `docs/permissions.md`.

---

## In één oogopslag

```
  VTK-admin  ──── org key (AES-256) ────▶  Vaultwarden  ◀──── Bitwarden-clients
  /admin/wachtwoorden                     (items, collections,   (extensie, mobiel,
      │                                    groups, members)       desktop, autofill)
      │ post ──────────▶ collection + group                            │
      │ GroupMembership ──────────▶ group members                      │
      └── VTK-SSO (OAuth-client, RESTRICTED op `vault.access`) ────────┘
```

Vaultwarden is de opslag; hij ziet enkel versleutelde blobs. **Onze database
bewaart geen enkel wachtwoord**, alleen de koppeling post ↔ collection en de
lidmaatschapsstatus. Bewust: een tweede kopie zou uit de pas lopen en in elke
backup meegaan.

---

## Waar wat staat

| Bestand                                       | Inhoud                                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------------------- |
| `apps/web/lib/vault/crypto.ts`                | Het Bitwarden-formaat in `node:crypto`: EncString, item-sleutels, RSA-wrap, de KDF |
| `apps/web/lib/vault/client.ts`                | De API: token, collections, groepen, leden, ciphers                                |
| `apps/web/lib/vault/items.ts`                 | De grens tussen klare tekst en EncStrings                                          |
| `apps/web/lib/vault/sync.ts`                  | `reconcileVault()` en `pushVaultMembership()`                                      |
| `apps/web/lib/vault/config.ts`                | `Setting`-sleutel `vault.config`, geheimen versleuteld                             |
| `apps/web/lib/vault/access.ts`                | Wie welke postkluis mag zien                                                       |
| `apps/web/app/api/vault/maintenance/route.ts` | Wat de `vault-worker` elke 5 minuten aanroept                                      |

| Route                        | Wat                                                         |
| ---------------------------- | ----------------------------------------------------------- |
| `/admin/wachtwoorden`        | De wachtwoorden van je eigen post(en)                       |
| `/admin/wachtwoorden/beheer` | IT: posten koppelen, sync-status per post en per lid        |
| `/admin/it`                  | Superadmin: URL, organisatie, API-key en organisatiesleutel |

Permissies, en let op dat het er **twee soorten** zijn:

| Waar | Code | Wat |
|---|---|---|
| Permissieregistry (`packages/db/src/permissions.ts`) | `vault.editOwn` | Eigen postkluis beheren in de admin |
| Permissieregistry | `vault.manage` | Posten koppelen, synchroniseren, configuratie |
| **SSO-clientpermissie** (`/admin/sso`, per client) | `vault.access` | Mag inloggen bij de kluis |

`vault.access` staat bewust **niet** in de registry: de toegangspoort van een
RESTRICTED client leest `SsoClientPermission`, een andere tabel en een ander
systeem (zie `docs/sso.md`). Ze in de registry zetten geeft twee codes met
dezelfde naam die niets met elkaar te maken hebben, en dan lijkt de toegang
geregeld terwijl er niemand binnen raakt. Toekennen doe je per post of per rol in
`/admin/sso/[clientId]`.

---

## Het crypto-formaat

Klein en gedocumenteerd, dus geen dependency; alles in `node:crypto`.

- **EncString type 2**: `2.<iv>|<ct>|<mac>`, AES-256-CBC met HMAC-SHA256. De
  sleutel is **64 bytes**: `key[0:32]` versleutelt, `key[32:64]` ondertekent. De
  MAC dekt `iv || ct`, niet enkel `ct`.
- **Item-sleutels**: moderne clients geven elk item een eigen 64-byte sleutel,
  die zelf met de organisatiesleutel versleuteld in `cipher.key` staat. Bij lezen
  eerst die ontsleutelen; bij schrijven altijd een verse.
- **EncString type 4**: `4.<base64>`, RSA-OAEP-**SHA1**. Enkel gebruikt om de
  organisatiesleutel naar de publieke sleutel van een nieuw lid te wrappen. SHA-1
  ziet er verkeerd uit maar is hier correct: het is de OAEP-hash die de clients
  voor type 4 verwachten, en het is geen handtekening.
- **KDF**: PBKDF2-SHA256, salt is het e-mailadres in kleine letters. De master
  password hash die naar de server gaat, is één extra PBKDF2-ronde over de master
  key met het wachtwoord als salt.

`apps/web/test/vaultCrypto.test.ts` toetst dit met twee onafhankelijke ankers,
want een round-trip tegen jezelf bewijst niets (encrypt en decrypt kunnen samen
dezelfde fout maken):

1. **openssl** ontsleutelt onze ciphertext en herrekent de MAC.
2. De **master password hash** in dat bestand is exact de waarde die een echte
   Vaultwarden 1.35.1 aanvaardde bij registratie en login. De server herrekent ze
   zelf, dus dat is een cross-implementatie-vector voor de hele PBKDF2-keten.

---

## Opzetten

0. **Database.** Vaultwarden krijgt een eigen database op onze Postgres, en die
   maakt Postgres niet vanzelf aan:
   `docker exec infra-postgres-1 psql -U vtk -c 'CREATE DATABASE vaultwarden;'`
   Zonder dit herstart de container in een lus.

1. **Container.** `infra/docker-compose.yml` heeft de service en de
   `vault-worker`; `infra/compose.dev.yml` heeft een lokale variant op
   `http://localhost:8222` (zonder SSO, anders sluit `SSO_ONLY` je buiten voor de
   OAuth-client bestaat).

   **Zet bij de allereerste start `VAULT_SIGNUPS_ALLOWED=true` en
   `VAULT_SSO_ONLY=false` in `.env`.** Anders kan je stap 2 niet doen: aanmelden
   staat uit en SSO stuurt je naar een client die nog niet bestaat. Zet ze leeg
   zodra stap 5 werkt. Doe dat in `.env` en niet in de compose: de deploy doet
   `git reset --hard origin/main` en gooit een wijziging daar weg.

2. **Botaccount.** Maak één account aan (`vault-bot@vtk.be`) en laat het de
   organisatie aanmaken; het is dan eigenaar. **Zet het KDF op PBKDF2**, niet op
   Argon2id: anders is er een native binding nodig, en dat is in deze monorepo
   precies het soort dependency dat de lockfile stuk maakt (zie `AGENTS.md`).

3. **API-key en organisatiesleutel.** In de webkluis: **Settings → Security →
   Keys → View API key**. De persoonlijke `client_id` begint met `user.` en de
   `client_secret` is de API-key. Haal daarna de organisatiesleutel lokaal op
   met `npx tsx --conditions=react-server scripts/vault-bootstrap-org-key.ts`.
   Het script vraagt de geheimen zonder echo, schrijft niets naar schijf en
   print de organisatie-id en de 64-byte sleutel in base64 voor `/admin/it`.

4. **SSO.** Maak in `/admin/sso/nieuw` een client aan met redirect-URI
   `https://<kluis>/identity/connect/oidc-signin`, scopes
   `openid profile email offline_access`, toegangsmodus **RESTRICTED** met
   namespace `vault`. Ken de clientpermissie `vault.access` daarna toe **per
   post** (of per rol) in `/admin/sso/[clientId]`; die toekenning volgt het
   werkingsjaar en reset dus mee op 15 juli.

   Vergeet daarnaast `vault.editOwn` niet in `/admin/roles`, anders raakt een lid
   wel binnen in de kluis maar ziet het `/admin/wachtwoorden` niet. Bij VTK dekt
   één toekenning aan de rol **Praesidium** vijftien posten; werkgroepen hebben
   hun eigen rol. Superadmins merken dit niet, want die passeren elke check.

5. **Posten koppelen** in `/admin/wachtwoorden/beheer`.

---

## Vallen waar we in gelopen zijn

- **Het e-mailadres moet het universitaire zijn.** Vaultwarden matcht een
  SSO-login op de `email`-claim, en die is bij ons per definitie het
  KU Leuven-adres (`docs/sso.md`). Nodig dus uit op `User.email`, nooit op
  `personalEmail` of een @vtk.be-alias; anders krijgt iemand twee accounts en
  ziet hij in de verkeerde geen enkel wachtwoord.

- **De casing van de API is niet consistent.** De identity-endpoints antwoorden
  in PascalCase (`Key`, `PrivateKey`), de api-endpoints in camelCase (`id`,
  `name`). Lees velden daarom via `field()` uit `client.ts`. Dit faalt stil: je
  code werkt op de ene helft van de API en krijgt `undefined` op de andere. Het
  heeft tijdens het bouwen al één keer een "Malformed client_id" opgeleverd die
  niets met de client-id te maken had.

- **`SSO_ONLY` sluit ook jou buiten.** Zet het pas aan wanneer de OAuth-client
  bestaat en werkt, anders raak je niet meer aan het botaccount. Daarom staat het
  op `${VAULT_SSO_ONLY:-true}` en niet hard in de compose: op de server wordt elke
  lokale wijziging aan een getrackt bestand bij de volgende deploy weggegooid.

- **Een uitnodiging is de echte poort, niet de OAuth-client.** Met
  `SIGNUPS_ALLOWED=false` weigert Vaultwarden een SSO-login van wie nog geen
  account heeft; er is geen zelfbediening. De RESTRICTED-client is het tweede
  slot, en dat is geen overdaad: er zijn bugs geweest waarbij SSO-aanmeldingen
  tóch doorgingen terwijl aanmelden uit stond.

- **Blijf voorlopig op 1.35.1.** In 1.35.5/1.35.6 brak het automatisch aanmaken
  en aanmelden via SSO (issue 7086). Test een upgrade eerst lokaal met de
  compose-variant uit `compose.dev.yml`.

- **Zonder `ORG_GROUPS_ENABLED=true` bestaan groepen niet**, en dan valt de hele
  koppeling post → groep → collection weg. De API geeft dan geen duidelijke fout.

- **Een leeg wachtwoordveld bij bewerken betekent "laat staan".** Het
  bewerkformulier vult een wachtwoord niet voor, dus zonder die uitzondering wist
  elke naamswijziging het wachtwoord. Zie `saveVaultItemAction`.

- **De post komt nooit uit het formulier.** Elke server action zoekt de post op
  via `requireVaultPost` voor de huidige sessie; een `collectionId` uit het
  formulier negeren we. Anders volstaat één gewijzigd hidden field om in de kluis
  van een andere post te schrijven.

- **De sync raakt enkel gewone leden aan** (`type === 2`). De eigenaar en de
  beheerders blijven met rust, want daar zit het botaccount tussen: een sync die
  zichzelf uit de organisatie gooit, kan nadien niets meer rechtzetten.

- **Uitnodigen levert de member-id niet meteen op.** Die kennen we pas de
  volgende ronde. Geen probleem (het lid kan toch niets lezen tot het bevestigd
  is), maar het verklaart waarom een verse post pas bij de tweede reconcile
  groepsleden krijgt.

---

## Bewust niet gebouwd

- **Geen wachtwoordgenerator, geen sterktemeter, geen deelbare links in de
  admin.** Dat zit in de clients, en die zijn er beter in.
- **Geen eigen client.** Autofill per browser, mobiele apps, offline kluis en
  recovery zijn jaren werk; de Bitwarden-clients doen dat al.
- **Geen persoonlijke kluizen in de admin.** Wat een lid in zijn eigen kluis zet,
  is met zijn master password versleuteld en gaat ons niet aan.
- **Geen automatische verwijdering van het Vaultwarden-account.** Zie
  `docs/design-decisions.md`.
