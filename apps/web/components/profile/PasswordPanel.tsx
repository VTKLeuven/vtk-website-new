"use client";

import { useState } from "react";
import { Card, Input, Label } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { setOwnPasswordAction } from "@/app/actions/register";

/**
 * "Inloggen zonder KU Leuven": zelf een wachtwoord instellen.
 *
 * Wie via KU Leuven binnenkomt heeft hier geen wachtwoord, en dat is prima
 * zolang die login werkt. Maar een KU Leuven-account verdwijnt een tijd na het
 * afstuderen, en op dat moment is er geen enkele manier meer om binnen te
 * geraken: geen wachtwoord om mee in te loggen, en een herstelmail zou naar een
 * mailbox gaan die niet meer bestaat.
 *
 * Dat is precies de groep die we op onze evenementen willen. Dit paneel is het
 * migratiepad, en het valt op wanneer het dringend wordt: wie zichzelf als
 * alumnus of als niet-meer-studerend aanduidde en nog geen wachtwoord heeft,
 * krijgt het met een gele rail in plaats van als zoveelste kaart.
 */
export function PasswordPanel({
  locale,
  hasPassword,
  resetEmail,
  usesPersonalEmail,
  loginEmail,
  urgent,
}: {
  locale: "nl" | "en";
  hasPassword: boolean;
  /** Waar een herstelmail naartoe zou gaan. */
  resetEmail: string;
  /** Is dat het persoonlijke adres, of nog altijd de universiteitsmail? */
  usesPersonalEmail: boolean;
  loginEmail: string;
  /** Alumnus of niet-meer-studerend, en nog geen wachtwoord. */
  urgent: boolean;
}) {
  const nl = locale === "nl";
  const [open, setOpen] = useState(!hasPassword && urgent);

  return (
    <Card className={`p-6${urgent ? " shadow-[inset_3px_0_0_var(--yellow)]" : ""}`}>
      <h3 className="text-lg font-semibold text-vtk-ink">
        {nl ? "Inloggen zonder KU Leuven" : "Signing in without KU Leuven"}
      </h3>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5c667f]">
        {nl
          ? "Je KU Leuven-account verdwijnt een tijd na je afstuderen. Stel nu een wachtwoord in, dan blijf je met je e-mailadres inloggen wanneer die login het opgeeft."
          : "Your KU Leuven account disappears some time after you graduate. Set a password now and you keep signing in with your email address once that login stops working."}
      </p>

      <dl className="mt-4 space-y-1 text-sm text-[#34405e]">
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-[#5c667f]">{nl ? "Wachtwoord" : "Password"}</dt>
          <dd className="font-medium">
            {hasPassword
              ? nl
                ? "Ingesteld"
                : "Set"
              : nl
                ? "Nog geen"
                : "Not set yet"}
          </dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-[#5c667f]">{nl ? "Inloggen met" : "Sign in with"}</dt>
          <dd className="font-medium">{loginEmail}</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-[#5c667f]">
            {nl ? "Herstelmail gaat naar" : "Recovery mail goes to"}
          </dt>
          <dd className="font-medium">{resetEmail}</dd>
        </div>
      </dl>

      {!usesPersonalEmail ? (
        <p className="mt-3 rounded-xl border border-vtk-blue/12 bg-vtk-blue-soft/40 p-3 text-sm leading-6 text-[#34405e]">
          {nl
            ? "Vul hieronder bij Profiel ook je persoonlijke e-mailadres in. Anders vertrekt een herstelmail naar je universiteitsmail, en die lees je na je afstuderen niet meer."
            : "Also fill in your personal email address under Profile below. Otherwise a recovery mail goes to your university address, which you will not be reading after you graduate."}
        </p>
      ) : (
        <p className="mt-3 text-xs text-[#5c667f]">
          {nl
            ? "Je kan ook met dat adres inloggen, zolang het maar bij één account hoort."
            : "You can sign in with that address too, as long as it belongs to just one account."}
        </p>
      )}

      {!open ? (
        <button
          type="button"
          className="mt-4 rounded-full border border-vtk-ink bg-vtk-ink px-4 py-2 text-sm font-medium text-vtk-surface transition-colors hover:bg-vtk-navy"
          onClick={() => setOpen(true)}
        >
          {hasPassword
            ? nl
              ? "Wachtwoord wijzigen"
              : "Change password"
            : nl
              ? "Wachtwoord instellen"
              : "Set a password"}
        </button>
      ) : (
        <div className="mt-4">
          <SaveForm
            action={setOwnPasswordAction}
            className="space-y-4 [&>button]:justify-self-start"
            submitLabel={
              hasPassword
                ? nl
                  ? "Wachtwoord wijzigen"
                  : "Change password"
                : nl
                  ? "Wachtwoord instellen"
                  : "Set password"
            }
            savingLabel={nl ? "Bezig met opslaan..." : "Saving..."}
            savedMessage={
              nl
                ? "Wachtwoord ingesteld. Je kan nu ook zonder KU Leuven inloggen."
                : "Password set. You can now sign in without KU Leuven too."
            }
            errorMessages={{
              PASSWORD_TOO_SHORT: nl
                ? "Niet opgeslagen: je wachtwoord moet minstens 10 tekens lang zijn."
                : "Not saved: your password must be at least 10 characters long.",
              PASSWORD_MISMATCH: nl
                ? "Niet opgeslagen: de twee wachtwoorden zijn niet gelijk."
                : "Not saved: the two passwords do not match.",
              INVALID_INPUT: nl
                ? "Niet opgeslagen: vul allebei de velden in."
                : "Not saved: fill in both fields.",
            }}
            fallbackErrorMessage={
              nl ? "Er ging iets mis bij het opslaan." : "Something went wrong while saving."
            }
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="new-password">{nl ? "Nieuw wachtwoord" : "New password"}</Label>
                <Input
                  id="new-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  required
                />
                <p className="mt-1 text-xs text-[#5c667f]">
                  {nl ? "Minstens 10 tekens." : "At least 10 characters."}
                </p>
              </div>
              <div>
                <Label htmlFor="new-password-repeat">
                  {nl ? "Herhaal het wachtwoord" : "Repeat the password"}
                </Label>
                <Input
                  id="new-password-repeat"
                  name="passwordRepeat"
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  required
                />
              </div>
            </div>
          </SaveForm>
        </div>
      )}
    </Card>
  );
}
