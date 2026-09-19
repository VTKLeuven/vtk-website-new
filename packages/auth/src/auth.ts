/**
 * better-auth config file
 *
 * @author Witse Panneels
 * @date 2026-06-19
 */
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { genericOAuth, jwt } from 'better-auth/plugins';
import { APIError } from 'better-auth/api';
import { oauthProvider, getOAuthProviderState } from '@better-auth/oauth-provider';
import { prisma } from '@vtk/db';
import { nextCookies } from 'better-auth/next-js';
import { hasSSOPrivileges } from './server/sso';
import { resolveClaims } from './server/claims';
import { checkClientAccess } from './server/clientAccess';

import { hashPassword, verifyPassword } from './logins/password';
import { kulOAuthConfig, KUL_PROVIDER_ID } from './logins/kul';
import { AUTH_BASE_PATH, OAUTH_CLIENT_OWNER, SCOPE_CODES } from './index';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * De proxy's waarvan we een hop in `x-forwarded-for` mogen geloven.
 *
 * Caddy draait op de host en is de enige publieke ingang; de containers
 * luisteren enkel op loopback. De standaard dekt loopback en de privéreeksen
 * waarin Docker zijn bridge-netwerk aanmaakt. Komt er ooit nog een proxy vóór
 * Caddy (Cloudflare), zet dan `BETTER_AUTH_TRUSTED_PROXIES` met komma's ertussen.
 *
 * Waarom dit überhaupt gezet moet worden, staat bij `advanced.ipAddress`
 * hieronder: zonder lijst valt de snelheidsbegrenzing terug op één emmer voor de
 * hele site.
 */
const TRUSTED_PROXIES = (
  process.env.BETTER_AUTH_TRUSTED_PROXIES ??
  '127.0.0.1/8,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16'
)
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

const kulConfig = kulOAuthConfig();

export const auth = betterAuth({
  appName: 'VTK',
  baseURL: process.env.BETTER_AUTH_URL,
  basePath: AUTH_BASE_PATH,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: isProduction
    ? ['https://*.vtk.be', 'https://vtk.be']
    : ['http://localhost:3000', 'http://localhost:3001'],

  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),

  // nextCookies must stay last. The KU Leuven OIDC provider is only registered
  // when its env vars are present (see logins/kul.ts).
  plugins: [
    ...(kulConfig ? [genericOAuth({ config: [kulConfig] })] : []),
    jwt({ disableSettingJwtHeader: true }),
    oauthProvider({
      // Padden zonder locale-prefix: de proxy herschrijft die naar /nl, zodat
      // de Nederlandse URL's schoon blijven. De plugin plakt de ondertekende
      // autorisatie-query erachter; die query draagt de volledige flowstatus.
      loginPage: '/inloggen',
      consentPage: '/inloggen/consent',

      // ── Toegangspoort ─────────────────────────────────────────────────────
      // LET OP: dit is de registratie-haak, en we gebruiken ze als
      // toegangscontrole. Dat is bewust, en het is de enige plek die werkt.
      //
      // De plugin heeft geen haak die "mag deze gebruiker bij deze client" kan
      // beantwoorden. Wat we nodig hadden is een punt dat draait op ELKE
      // doorgang door authorize, ook wanneer het toestemmingsscherm wordt
      // overgeslagen. Er is er precies één:
      //
      //   · een check op ons consent-scherm valt open voor clients met
      //     `skipConsent` en voor leden die al eerder toestemden; in beide
      //     gevallen komt de plugin daar nooit;
      //   · een `hooks.before` op /oauth2/authorize vangt de eerste browserhit,
      //     maar de consent-postback roept authorize rechtstreeks als functie
      //     aan en gaat dus niet door de router;
      //   · `signup.shouldRedirect` draait ongeconditioneerd, vóór zowel de
      //     `skipConsent`-sluiproute als de bestaande-toestemming-sluiproute.
      //
      // Een string teruggeven betekent "stuur naar deze pagina"; de plugin plakt
      // de ondertekende query erachter, dus de blokpagina weet over welke app
      // het gaat. Verplaats dit niet naar een andere haak zonder de volgorde in
      // `authorizeEndpoint` opnieuw na te lezen; de integratietest
      // apps/web/test/integration/sso-client-permissions.integration.ts legt de
      // toegangsregel zelf vast.
      signup: {
        page: '/inloggen/geen-toegang',
        shouldRedirect: async ({ user }) => {
          const state = await getOAuthProviderState();
          const clientId = state?.query ? new URLSearchParams(state.query).get('client_id') : null;
          // Geen client in beeld: dit is geen autorisatieflow, dus niets te
          // blokkeren. Doorlaten en de plugin haar werk laten doen.
          if (!clientId) return false;

          const { allowed } = await checkClientAccess(user.id, clientId);
          return allowed ? false : '/inloggen/geen-toegang';
        },
      },

      // Elk token dat `entitlements` draagt vervalt na tien minuten (ontwerp
      // 10.6). Dat is het antwoord op "hoe lang blijft een ingetrokken
      // permissie werken": tien minuten, altijd, zonder dat de client iets moet
      // doen. Een gewoon `openid profile`-token houdt zijn volle uur.
      //
      // LET OP: dit moet een duurstring zijn, geen getal. De plugin duwt deze
      // waarde door `toExpJWT()`, en dat behandelt een getal als een absolute
      // epoch-seconde (`600` = 1 januari 1970, 00:10 UTC), niet als "over 600
      // seconden". Met een getal krijgt elke client die `entitlements` vraagt
      // een token dat al verlopen is; UserInfo antwoordt dan met het misleidende
      // `invalid_scope` / "Missing required scope".
      scopeExpirations: { entitlements: '10m' },
      // De scope-registry (lib/scopes.ts) is de bron; zonder deze regel staat de
      // plugin enkel haar vier standaardscopes toe en faalt het aanmaken van een
      // client met bv. `vtk:study_programme` op `invalid_scope`.
      scopes: [...SCOPE_CODES],

      // We publiceren geen losse RFC 8707 resource servers. De upstream plugin
      // bindt toegelaten `resource`-audiences momenteel niet per OAuth-client
      // (GHSA-p2fr-6hmx-4528). Een lege expliciete lijst schakelt die globale
      // resource-indicatorroute uit; enkel de door de plugin afgeleide UserInfo-
      // audience blijft beschikbaar voor normale OpenID Connect-clients.
      validAudiences: [],

      // Welke claims onder welke scope vrijkomen, staat in lib/claims.ts. De
      // meeste zitten enkel in UserInfo en niet in het ID token: dat wordt één
      // keer uitgegeven en veroudert, terwijl UserInfo live opgehaald wordt.
      customIdTokenClaims: async ({ user, scopes }) =>
        resolveClaims({ destination: 'id_token', userId: user.id, scopes: [...scopes] }),

      // `jwt` is de payload van het access token waarmee UserInfo opgehaald wordt,
      // en de enige plek waar de client bekend is. Onze access tokens zijn opaque,
      // dus die payload draagt `client_id`; `azp` bestaat enkel op een JWT access
      // token. Lees allebei, anders valt de `permissions`-claim stil weg.
      customUserInfoClaims: async ({ user, scopes, jwt }) =>
        resolveClaims({
          destination: 'userinfo',
          userId: user.id,
          scopes: [...scopes],
          clientId:
            typeof jwt?.client_id === 'string'
              ? jwt.client_id
              : typeof jwt?.azp === 'string'
                ? jwt.azp
                : undefined,
        }),

      customAccessTokenClaims: async ({ user, scopes }) =>
        user ? resolveClaims({ destination: 'access_token', userId: user.id, scopes: [...scopes] }) : {},

      // Clients zijn van VTK, niet van de persoon die ze aanmaakte. De plugin
      // hangt eigenaarschap aan `userId` OF aan deze referentie, en weigert
      // verwijderen en secret-rotatie wanneer beide leeg zijn. Een vaste waarde
      // maakt elke beheerder eigenaar van elke client, wat hier de bedoeling is.
      // Bewust een constante: de plugin roept deze hook niet overal met dezelfde
      // argumenten aan, dus negeren we ze.
      clientReference: () => OAUTH_CLIENT_OWNER,

      // Bewust alles-of-niets: binnen IT heeft iedereen dezelfde rechten, dus
      // een map per action zou een verschil suggereren dat niet bestaat.
      clientPrivileges: async ({ action, headers, user, session }) => {
        return hasSSOPrivileges(headers); // alle actions zijn enkel toegankelijk voor admins (IT en G5)
      },

      // Herkenbaar voor secret scanners. De prefix wordt niet mee opgeslagen,
      // dus dit moet vastliggen vóór de eerste echte client: achteraf toevoegen
      // maakt elke bestaande token ongeldig.
      prefix: {
        opaqueAccessToken: 'vtk_at_',
        refreshToken: 'vtk_rt_',
        clientSecret: 'vtk_cs_',
      },

      // Optioneel: zonder deze env-var adverteert discovery enkel
      // subject_type "public" en kan geen client op "pairwise" staan. De
      // plugin eist minstens 32 tekens en gooit anders bij het opbouwen van
      // `auth`. Behandel de waarde als BETTER_AUTH_SECRET: raakt ze kwijt, dan
      // breekt in één klap elke accountkoppeling van elke pairwise client.
      pairwiseSecret: process.env.OAUTH_PAIRWISE_SECRET,
      // De issuer draagt een pad, dus hoort discovery onder basePath en niet op
      // de host-root; de plugin serveert dat al. Enkel de RFC 8414-variant valt
      // buiten de /api/auth-catch-all, en die rewrite de proxy. Zie 16.3.
      silenceWarnings: { oauthAuthServerConfig: true },
    }),
    nextCookies(),
  ],

  disabledPaths: ['/token'], //disable for Oauth

  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    password: {
      hash: hashPassword,
      verify: verifyPassword,
    },
  },

  // KU Leuven OIDC returns verified emails, so link a KUL login to the
  // pre-provisioned User that already owns that email instead of erroring on a
  // duplicate. Brand-new KUL identities are allowed to self-provision: with no
  // `user.create` hook to block them, better-auth creates a fresh user (email/
  // password signup stays disabled, and admin-created users bypass better-auth
  // via prisma.user.create, so this only ever fires for SSO). New users land
  // with no memberships/permissions and `onboardedAt = null`, so the onboarding
  // gate forces them to complete their profile before using the site.
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: [KUL_PROVIDER_ID],
    },
  },

  databaseHooks: {
    user: {
      update: {
        // Deze velden zijn enkel `input: true` zodat de KU Leuven-provider ze
        // bij een nieuw OAuth-account kan initialiseren. Gewone better-auth
        // update-user-calls mogen de autoritatieve waarden nooit overschrijven;
        // latere SSO-syncs schrijven rechtstreeks en conditioneel via Prisma.
        before: async (user) => {
          if ("firwStudent" in user || "firwStudentChangedAt" in user) {
            throw new APIError("BAD_REQUEST", { message: "FIRW_STATUS_READ_ONLY" });
          }
          return { data: user };
        },
      },
    },
    session: {
      // Mirror the `active` gate the password flow enforces in loginAction, so
      // deactivated members cannot obtain a session via SSO either.
      create: {
        before: async (session) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { active: true },
          });
          if (!user?.active) {
            throw new APIError('FORBIDDEN', { message: 'INACTIVE_USER' });
          }
          return { data: session };
        },
      },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 day expiry
    updateAge: 60 * 60 * 24,
    // De sessie komt uit een ondertekende cookie in plaats van uit de
    // Session-tabel. Zonder dit deed élk verzoek van een ingelogd lid eerst een
    // lezing op die tabel, nog voor onze eigen queries begonnen; bij een piek
    // (ticketverkoop, 500 gelijktijdige bezoekers) is dat de duurste query die
    // niets oplevert wat vijf minuten later niet nog waar is.
    //
    // Wat dit NIET uitstelt: een gedeactiveerd lid. Zowel `getSession` als
    // `getGateUser` lezen `active` live uit de database, dus deactiveren werkt
    // onmiddellijk. Wat wel tot `maxAge` kan nalopen, is het intrekken van een
    // sessierij zelf ("overal afmelden"): op een ander toestel blijft de
    // ondertekende cookie zolang geldig. Afmelden op het toestel zelf wist de
    // cookie en werkt dus wel meteen.
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },

  // ── Snelheidsbegrenzing ───────────────────────────────────────────────────
  //
  // better-auth zet dit standaard AAN in productie, met 100 verzoeken per 10
  // seconden en, via een ingebouwde regel, 3 per 10 seconden op `/sign-in*`.
  // Zonder een oplosbaar client-IP valt dat allemaal in één gedeelde emmer voor
  // de hele site (`no-trusted-ip`), en dan zijn dat drie aanmeldingen per tien
  // seconden voor álle bezoekers samen. Bij een piek is iedereen daarna 429, ook
  // de SSO-doorgangen van de cursusdienst, want die lopen over dezelfde routes.
  //
  // De getallen hieronder gaan uit van wat deze kring echt is: honderden leden
  // die tegelijk binnenkomen, grotendeels via hetzelfde campusnetwerk en dus met
  // hetzelfde publieke adres. Een limiet per IP is voor zulk verkeer een botte
  // bijl; de echte bescherming tegen het raden van wachtwoorden zit per account
  // (`checkLoginBlocked` in server/selfSignup.ts), niet hier. Dit blijft staan
  // als vangnet tegen een bot die er in zijn eentje op los gaat.
  //
  // LET OP, dit is de val die ons een tweede keer klemzette: er zijn DRIE lagen,
  // en `window`/`max` hieronder zijn enkel de onderste. `resolveRateLimitConfig`
  // in better-auth kiest in deze volgorde, waarbij elke volgende de vorige
  // overschrijft:
  //
  //   1. de globale `window`/`max` hieronder;
  //   2. de ingebouwde regels van better-auth (`/sign-in*` op 3 per 10s);
  //   3. de regels die een PLUGIN zelf meebrengt;
  //   4. `customRules` hieronder, die als laatste komt en dus altijd wint.
  //
  // Laag 3 is het addertje. `@better-auth/oauth-provider` zet zijn eigen limiet
  // op zijn eigen routes: `/oauth2/token` op 20 per minuut en
  // `/oauth2/authorize` op 30 per minuut. Een globale `max` verhogen doet daar
  // dus niets aan. En precies die token-route is server-naar-server: elke
  // aanmelding op een SSO-client (de cursusdienst) komt van het ENE adres van
  // die server, dus twintig aanmeldingen per minuut voor die hele site samen.
  // Bij een lesuur dat uitgaat is dat in seconden op, en het lid ziet enkel de
  // foutpagina van de client. Zie docs/sso.md.
  rateLimit: {
    window: 60,
    max: 2000,
    customRules: {
      // Ruim boven wat een volle aula aan gelijktijdige aanmeldingen haalt, en
      // nog altijd ver onder wat brute force nodig heeft.
      '/sign-in/*': { window: 60, max: 120 },
      // Deze versturen mail; die blijven wél streng.
      '/request-password-reset': { window: 60, max: 10 },
      '/send-verification-email': { window: 60, max: 10 },

      // De OAuth-routes, die de plugin anders op 20 tot 30 per minuut zet.
      //
      // Bewust een hoog plafond en niet `false` (waarmee je een route volledig
      // vrijstelt): een client die op hol slaat, hoort nog steeds tegen een muur
      // te lopen in plaats van ongelimiteerd onze database te mogen bevragen.
      //
      // `token`, `userinfo` en `introspect` praten server-naar-server en tellen
      // dus per client-server, niet per lid. `authorize` komt wél uit de browser
      // van het lid, maar dat lid deelt zijn adres met de halve campus.
      '/oauth2/token': { window: 60, max: 2000 },
      '/oauth2/authorize': { window: 60, max: 2000 },
      '/oauth2/userinfo': { window: 60, max: 2000 },
      '/oauth2/introspect': { window: 60, max: 2000 },
      '/oauth2/revoke': { window: 60, max: 600 },
      // `/oauth2/register` blijft op de strenge standaard van de plugin (5 per
      // minuut): dat is dynamische clientregistratie en die hoort zeldzaam te
      // zijn.
    },
  },

  advanced: {
    database: {
      validateSchema: false,
    },
    cookiePrefix: process.env.BETTER_AUTH_COOKIE_PREFIX || 'vtk',
    useSecureCookies: isProduction,
    crossSubDomainCookies: {
      enabled: isProduction,
      domain: process.env.BETTER_AUTH_COOKIE_DOMAIN,
    },
    ipAddress: {
      // Zonder dit vertrouwt better-auth `x-forwarded-for` enkel wanneer die
      // header precies één waarde draagt, en geeft ze anders `null` terug: dan
      // deelt de hele site één emmer. Caddy voegt het echte adres achteraan toe,
      // dus een bezoeker die zelf een `x-forwarded-for` meestuurt maakt er twee.
      //
      // Met een (niet-lege) lijst loopt de resolver de keten van rechts naar
      // links tot de eerste hop die hier niet in staat, en dat is precies de
      // waarde die Caddy zelf aanhing. De inhoud van de lijst doet er daardoor
      // weinig toe zolang Caddy de laatste schakel is; ze wordt pas belangrijk
      // wanneer er nog een proxy voor komt (Cloudflare), en daarom is ze
      // instelbaar. Zie docs/sso.md.
      trustedProxies: TRUSTED_PROXIES,
    },
  },

  user: {
    additionalFields: {
      // KU Leuven r-number, stored on first login from the OIDC profile (see
      // logins/kul.ts) so the onboarding form is pre-filled. `input` stays at
      // its default (true) on purpose: better-auth drops `input: false` fields
      // when persisting an OAuth profile, so this must stay writable for the
      // provider mapping to land. The column is unique in Prisma, which guards
      // against collisions.
      rNumber: {
        type: "string",
        required: false,
      },
      // `true` when `rNumber` came from KU Leuven (set alongside it in
      // logins/kul.ts). The profile form renders the r-number read-only when
      // this is set, and saveProfileAction refuses to change it. Same reason as
      // rNumber for keeping `input` at its default: it is written from the OIDC
      // profile. Flipping it via the client only unlocks your own r-number (a
      // value already user-editable in the self-entered case), so no hard gate.
      rNumberFromKul: {
        type: "boolean",
        required: false,
        defaultValue: false,
      },
      // Autoritatieve faculteitsstatus uit KU Leuven eduPersonOrgUnitDN. Beide
      // velden moeten input aanvaarden zodat ze op de eerste OAuth-login mee in
      // de nieuwe User-rij landen. De user.update-hook hierboven voorkomt dat
      // een gewone client ze nadien zelf kan wijzigen.
      firwStudent: {
        type: "boolean",
        required: false,
        defaultValue: false,
      },
      firwStudentChangedAt: {
        type: "date",
        required: false,
      },
      avatarKey: {
        type: 'string',
        required: false,
        input: false,
      },
      locale: {
        type: 'string',
        required: false,
        defaultValue: 'NL',
      },
      active: {
        type: 'boolean',
        required: false,
        defaultValue: true,
        input: false,
      },
      isSuperAdmin: {
        type: 'boolean',
        required: false,
        defaultValue: false,
        input: false,
      },
    },
  },
});

export type Auth = typeof auth;
