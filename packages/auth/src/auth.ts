/**
 * better-auth config file
 *
 * @author Witse Panneels
 * @date 2026-06-19
 */
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@vtk/db";
import { nextCookies } from "better-auth/next-js";

import { hashPassword, verifyPassword } from "./logins/password";

const isProduction = process.env.NODE_ENV === "production";

export const auth = betterAuth({
  appName: "VTK",
  baseURL: process.env.BETTER_AUTH_URL,
  basePath: "/api/auth/better",
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: isProduction
    ? ["https://*.vtk.be"]
    : ["http://localhost:3000", "http://localhost:3001"],

  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  plugins: [nextCookies()], // nextCookies must be last import

  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    password: {
      hash: hashPassword,
      verify: verifyPassword,
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 day expiry
    updateAge: 60 * 60 * 24,
  },

  advanced: {
    cookiePrefix: "vtk",
    useSecureCookies: isProduction,
    crossSubDomainCookies: {
      enabled: isProduction,
      domain: process.env.BETTER_AUTH_COOKIE_DOMAIN,
    },
  },

  user: {
    additionalFields: {
      avatarKey: {
        type: "string",
        required: false,
        input: false,
      },
      locale: {
        type: "string",
        required: false,
        defaultValue: "NL",
      },
      active: {
        type: "boolean",
        required: false,
        defaultValue: true,
        input: false,
      },
      isSuperAdmin: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
    },
  },
});

export type Auth = typeof auth;
