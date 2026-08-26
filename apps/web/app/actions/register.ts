"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuthError } from "@vtk/auth";
import {
  MIN_PASSWORD_LENGTH,
  createPasswordReset,
  registerSelfServiceAccount,
  reissueEmailVerification,
  resetPasswordWithToken,
  setOwnPassword,
} from "@vtk/auth/server";
import { normalizeLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { sendPasswordResetMail, sendVerificationMail } from "@/lib/accountMail";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";

/**
 * Zelfregistratie, bevestiging en wachtwoordherstel voor accounts zonder KU
 * Leuven-login.
 *
 * Elke actie hier antwoordt **hetzelfde** of het adres nu bestaat of niet. Een
 * registratieformulier dat "dit adres is al in gebruik" zegt, is een lijst van
 * onze leden voor wie er systematisch adressen doorheen jaagt; hetzelfde geldt
 * voor "wachtwoord vergeten". Wie het adres echt heeft, ziet in zijn mailbox wat
 * er aan de hand is.
 */

/**
 * Een afstudeerjaar dat een mens kan hebben. De ondergrens is het stichtingsjaar
 * van VTK; de bovengrens loopt mee, want wie in juni afstudeert vult dat in
 * september als "vorig jaar" in, en wie zijn laatste examen nog moet afleggen
 * denkt al aan volgend jaar.
 */
const MIN_GRADUATION_YEAR = 1920;

function graduationYearField() {
  const max = new Date().getFullYear() + 1;
  return z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d{4}$/.test(v) && Number(v) >= MIN_GRADUATION_YEAR && Number(v) <= max))
    .default("");
}

const registerSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(1),
    passwordRepeat: z.string().min(1),
    alumni: z.boolean().default(false),
    graduationYear: graduationYearField(),
    wasInVtk: z.boolean().default(false),
    mailOptIn: z.boolean().default(false),
    locale: z.string().default("nl"),
  });

export type RegisterErrorCode =
  | "INVALID_REGISTRATION"
  | "PASSWORD_TOO_SHORT"
  | "PASSWORD_MISMATCH"
  | "MAIL_FAILED";

export async function registerAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const parsed = registerSchema.safeParse({
    firstName: formData.get("firstName") ?? "",
    lastName: formData.get("lastName") ?? "",
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
    passwordRepeat: formData.get("passwordRepeat") ?? "",
    alumni: formData.get("alumni") === "on",
    graduationYear: formData.get("graduationYear") ?? "",
    wasInVtk: formData.get("wasInVtk") === "on",
    mailOptIn: formData.get("mailOptIn") === "on",
    locale: formData.get("locale") ?? "nl",
  });
  if (!parsed.success) return saveError("INVALID_REGISTRATION" satisfies RegisterErrorCode);

  const data = parsed.data;
  if (data.password !== data.passwordRepeat) {
    return saveError("PASSWORD_MISMATCH" satisfies RegisterErrorCode);
  }
  if (data.password.length < MIN_PASSWORD_LENGTH) {
    return saveError("PASSWORD_TOO_SHORT" satisfies RegisterErrorCode);
  }

  const locale = normalizeLocale(data.locale);

  let result;
  try {
    result = await registerSelfServiceAccount({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      password: data.password,
      locale: locale === "en" ? "EN" : "NL",
      alumni: data.alumni,
      graduationYear: data.alumni && data.graduationYear ? Number(data.graduationYear) : null,
      wasInVtk: data.alumni ? data.wasInVtk : false,
      alumniMailOptIn: data.alumni ? data.mailOptIn : false,
    });
  } catch (err) {
    if (err instanceof AuthError && err.code === "PASSWORD_TOO_SHORT") {
      return saveError("PASSWORD_TOO_SHORT" satisfies RegisterErrorCode);
    }
    throw err;
  }

  // `token === null` betekent dat het adres al een account heeft. Er vertrekt dan
  // niets, en de bezoeker ziet exact hetzelfde scherm.
  if (result.token) {
    const sent = await sendVerificationMail({
      to: result.email,
      name: result.name,
      token: result.token,
      locale,
    });
    if (!sent) return saveError("MAIL_FAILED" satisfies RegisterErrorCode);
  }

  return saveOk();
}

const emailOnlySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  locale: z.string().default("nl"),
});

/** Nieuwe bevestigingsmail. Antwoordt altijd "ok", ook zonder account. */
export async function resendVerificationAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const parsed = emailOnlySchema.safeParse({
    email: formData.get("email") ?? "",
    locale: formData.get("locale") ?? "nl",
  });
  if (!parsed.success) return saveError("INVALID_INPUT");

  const pending = await reissueEmailVerification(parsed.data.email);
  if (pending) {
    await sendVerificationMail({
      to: parsed.data.email,
      name: pending.name,
      token: pending.token,
      locale: normalizeLocale(parsed.data.locale),
    });
  }
  return saveOk();
}

/** Herstellink aanvragen. Antwoordt altijd "ok", ook zonder account. */
export async function requestPasswordResetAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const parsed = emailOnlySchema.safeParse({
    email: formData.get("email") ?? "",
    locale: formData.get("locale") ?? "nl",
  });
  if (!parsed.success) return saveError("INVALID_INPUT");

  const reset = await createPasswordReset(parsed.data.email);
  if (reset) {
    await sendPasswordResetMail({
      to: reset.email,
      name: reset.name,
      token: reset.token,
      locale: normalizeLocale(parsed.data.locale),
    });
  }
  return saveOk();
}

const newPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(1),
  passwordRepeat: z.string().min(1),
});

export type PasswordResetErrorCode =
  | "INVALID_INPUT"
  | "PASSWORD_TOO_SHORT"
  | "PASSWORD_MISMATCH"
  | "TOKEN_INVALID";

export async function setNewPasswordAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const parsed = newPasswordSchema.safeParse({
    token: formData.get("token") ?? "",
    password: formData.get("password") ?? "",
    passwordRepeat: formData.get("passwordRepeat") ?? "",
  });
  if (!parsed.success) return saveError("INVALID_INPUT" satisfies PasswordResetErrorCode);
  if (parsed.data.password !== parsed.data.passwordRepeat) {
    return saveError("PASSWORD_MISMATCH" satisfies PasswordResetErrorCode);
  }
  if (parsed.data.password.length < MIN_PASSWORD_LENGTH) {
    return saveError("PASSWORD_TOO_SHORT" satisfies PasswordResetErrorCode);
  }

  let ok: boolean;
  try {
    ok = await resetPasswordWithToken(parsed.data.token, parsed.data.password);
  } catch (err) {
    if (err instanceof AuthError && err.code === "PASSWORD_TOO_SHORT") {
      return saveError("PASSWORD_TOO_SHORT" satisfies PasswordResetErrorCode);
    }
    throw err;
  }
  if (!ok) return saveError("TOKEN_INVALID" satisfies PasswordResetErrorCode);

  return saveOk();
}


/**
 * Zelf een wachtwoord instellen op je eigen account.
 *
 * Het migratiepad voor wie via KU Leuven binnenkomt: dat account verdwijnt een
 * tijd na het afstuderen, en dan is er geen enkele manier meer om in te loggen.
 * Zie het paneel op /account.
 */
export async function setOwnPasswordAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requireSession();

  const password = String(formData.get("password") ?? "");
  const passwordRepeat = String(formData.get("passwordRepeat") ?? "");
  if (!password || !passwordRepeat) {
    return saveError("INVALID_INPUT" satisfies PasswordResetErrorCode);
  }
  if (password !== passwordRepeat) {
    return saveError("PASSWORD_MISMATCH" satisfies PasswordResetErrorCode);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return saveError("PASSWORD_TOO_SHORT" satisfies PasswordResetErrorCode);
  }

  try {
    await setOwnPassword(session.user.id, password);
  } catch (err) {
    if (err instanceof AuthError && err.code === "PASSWORD_TOO_SHORT") {
      return saveError("PASSWORD_TOO_SHORT" satisfies PasswordResetErrorCode);
    }
    throw err;
  }

  revalidatePath("/account");
  return saveOk();
}
