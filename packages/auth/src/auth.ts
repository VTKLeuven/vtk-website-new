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
import { oauthProvider } from '@better-auth/oauth-provider';
import { prisma } from '@vtk/db';
import { nextCookies } from 'better-auth/next-js';
import { hasSSOPrivileges } from './server/sso';

import { hashPassword, verifyPassword } from './logins/password';
import { kulOAuthConfig, KUL_PROVIDER_ID } from './logins/kul';
import { AUTH_BASE_PATH } from './index';

const isProduction = process.env.NODE_ENV === 'production';

const kulConfig = kulOAuthConfig();

export const auth = betterAuth({
  appName: 'VTK',
  baseURL: process.env.BETTER_AUTH_URL,
  basePath: AUTH_BASE_PATH,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: isProduction ? ['https://*.vtk.be'] : ['http://localhost:3000', 'http://localhost:3001'],

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
  },

  advanced: {
    cookiePrefix: 'vtk',
    useSecureCookies: isProduction,
    crossSubDomainCookies: {
      enabled: isProduction,
      domain: process.env.BETTER_AUTH_COOKIE_DOMAIN,
    },
  },

  user: {
    additionalFields: {
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
