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
 */
export function DownloadGate({ locale }: { locale: Locale }) {
  const nl = locale === "nl";
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  if (!sent) {
    return (
      <SaveForm
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
        className="mt-5 max-w-sm space-y-3"
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
    );
  }

  return (
    <SaveForm
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
      className="mt-5 max-w-sm space-y-3"
    >
      <input type="hidden" name="email" value={email} />
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
      <p className="text-sm text-[#5c667f]">
        {nl ? `Verstuurd naar ${email}.` : `Sent to ${email}.`}{" "}
        <button
          type="button"
          className="underline"
          onClick={() => setSent(false)}
        >
          {nl ? "Ander adres gebruiken" : "Use a different address"}
        </button>
      </p>
    </SaveForm>
  );
}
