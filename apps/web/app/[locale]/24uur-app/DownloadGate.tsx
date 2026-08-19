"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Label } from "@vtk/ui";
import { type Locale } from "@vtk/i18n";
import { SaveForm } from "@/components/ui/SaveForm";
import { requestCodeAction, verifyCodeAction } from "@/app/actions/urenloop-app";

/**
 * Twee stappen: adres, dan code.
 *
 * De eerste stap meldt altijd hetzelfde, ook wanneer het adres niet op de lijst
 * staat. Zou hij dat onderscheid tonen, dan is dit formulier een manier om uit
 * te zoeken welke kringen de app hebben.
 *
 * Het adres blijft in de state staan zodat de tweede stap het kan meesturen; het
 * gaat als hidden field mee en niet via de server, want tussen de twee stappen
 * zit geen sessie: pas een geldige code levert er een op.
 *
 * De kop en de uitleg horen hier en niet in de server component: ze veranderen
 * mee met de stap, en die kent enkel deze component. `ttlMinutes` komt wel van
 * buiten, want `lib/urenloopApp/config` is server-only.
 */
export function DownloadGate({ locale, ttlMinutes }: { locale: Locale; ttlMinutes: number }) {
  const nl = locale === "nl";
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const steps = (
    <div className="vtk-ulapp-steps">
      <span className="vtk-ulapp-step" aria-current={sent ? undefined : "step"}>
        <span>1</span>
        {nl ? "Adres" : "Address"}
      </span>
      <span className="vtk-ulapp-step-line" aria-hidden />
      <span className="vtk-ulapp-step" aria-current={sent ? "step" : undefined}>
        <span>2</span>
        {nl ? "Code" : "Code"}
      </span>
    </div>
  );

  if (!sent) {
    return (
      <>
        {steps}
        <h2 id="access-title">{nl ? "Toegang" : "Access"}</h2>
        <p className="vtk-ulapp-lead">
          {nl
            ? `De app is enkel voor kringen waarmee we ze delen. Vul het adres in waarmee je toegang kreeg; je krijgt er een code op, die ${ttlMinutes} minuten geldig is.`
            : `The app is only for associations we share it with. Enter the address you were given access with; we mail a code to it that stays valid for ${ttlMinutes} minutes.`}
        </p>
        <SaveForm
          // Zie de sleutel op het codeformulier hieronder.
          key="email"
          action={requestCodeAction}
          submitLabel={nl ? "Stuur me een code" : "Send me a code"}
          savingLabel={nl ? "Versturen..." : "Sending..."}
          savedMessage={
            nl
              ? "Staat dit adres op de lijst, dan is de code onderweg."
              : "If this address is on the list, the code is on its way."
          }
          errorMessages={{
            INVALID_EMAIL: nl ? "Dat is geen geldig e-mailadres." : "That is not a valid email address.",
          }}
          fallbackErrorMessage={nl ? "Versturen is niet gelukt." : "Could not send the code."}
          resetOnSuccess={false}
          onSuccess={() => setSent(true)}
          className="vtk-ulapp-form"
        >
          <div>
            <Label htmlFor="urenloop-access-email">{nl ? "E-mailadres" : "Email address"}</Label>
            <Input
              id="urenloop-access-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
        </SaveForm>
      </>
    );
  }

  return (
    <>
      {steps}
      <h2 id="access-title">{nl ? "Vul de code in" : "Enter the code"}</h2>
      <p className="vtk-ulapp-lead">
        {nl
          ? `Staat ${email} op de lijst, dan kreeg je daar zonet een code van zes cijfers op. Ze blijft ${ttlMinutes} minuten geldig.`
          : `If ${email} is on the list, a six digit code just arrived there. It stays valid for ${ttlMinutes} minutes.`}
      </p>
      <SaveForm
        /**
         * Een eigen sleutel per stap, anders hergebruikt React het `<input>` van
         * stap 1 voor het codeveld: beide stappen renderen dezelfde vorm
         * (SaveForm > form > div > Label + Input), dus reconciliatie ziet één
         * component op dezelfde plek. Het e-mailveld is gecontroleerd en het
         * codeveld niet, dus de DOM-node hield zijn waarde en je adres bleef in
         * het vakje staan waar om de code gevraagd wordt.
         */
        key="code"
        action={verifyCodeAction}
        submitLabel={nl ? "Openen" : "Unlock"}
        savingLabel={nl ? "Controleren..." : "Checking..."}
        savedMessage={nl ? "Gelukt, de downloads staan klaar." : "Done, the downloads are ready."}
        errorMessages={{
          INVALID_CODE: nl
            ? "Die code klopt niet, of ze is verlopen. Vraag desnoods een nieuwe aan."
            : "That code is wrong or expired. Request a new one if needed.",
          TOO_MANY: nl
            ? "Te veel pogingen op deze code. Vraag een nieuwe aan."
            : "Too many attempts on this code. Request a new one.",
        }}
        fallbackErrorMessage={nl ? "Controleren is niet gelukt." : "Could not check the code."}
        resetOnSuccess={false}
        // De cookie is nu gezet, maar die staat al in het antwoord van de action;
        // de server component moet opnieuw draaien om de downloads te tonen.
        onSuccess={() => router.refresh()}
        className="vtk-ulapp-form"
      >
        <div>
          <Label htmlFor="urenloop-access-code">{nl ? "Code uit de mail" : "Code from the email"}</Label>
          <Input
            id="urenloop-access-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            placeholder="000000"
          />
        </div>
        <input type="hidden" name="email" value={email} />
        <p className="vtk-ulapp-note">
          <button type="button" className="vtk-ulapp-again" onClick={() => setSent(false)}>
            {nl ? "Ander adres gebruiken" : "Use a different address"}
          </button>
        </p>
      </SaveForm>
    </>
  );
}
