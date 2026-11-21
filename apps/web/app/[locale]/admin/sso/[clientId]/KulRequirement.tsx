'use client';

/**
 * Welke KU Leuven-login een applicatie vraagt, bovenop de toegangsmodus.
 *
 * Een aparte sectie en een aparte opslag, want het is een andere vraag dan
 * "open of beperkt": een beperkte applicatie kan ook enkel studenten willen, en
 * een open applicatie (Burgieclan) ook. Zie docs/sso.md.
 */
import { useState } from 'react';
import { SaveForm } from '@/components/ui/SaveForm';
import { setKulRequirementAction } from '../actions';

type Requirement = 'NONE' | 'LINKED' | 'STUDENT';

const OPTIONS: { value: Requirement; nl: [string, string]; en: [string, string] }[] = [
  {
    value: 'NONE',
    nl: ['Niet vereist', 'Elk lid kan inloggen, ook met een wachtwoord en zonder KU Leuven-login.'],
    en: ['Not required', 'Any member can sign in, also with a password and without a KU Leuven login.'],
  },
  {
    value: 'LINKED',
    nl: [
      'KU Leuven-login gekoppeld',
      'Enkel leden van wie het VTK-account aan een KU Leuven-login hangt. Studenten en personeel allebei.',
    ],
    en: [
      'KU Leuven login linked',
      'Only members whose VTK account is linked to a KU Leuven login. Students and staff alike.',
    ],
  },
  {
    value: 'STUDENT',
    nl: [
      'Enkel KU Leuven-studenten',
      'Enkel wie laatst via KU Leuven inlogde met een r-nummer en een adres op student.kuleuven.be. Personeel en proffen (u-nummer) raken niet binnen.',
    ],
    en: [
      'KU Leuven students only',
      'Only members whose last KU Leuven login was an r-number with a student.kuleuven.be address. Staff and professors (u-number) cannot get in.',
    ],
  },
];

export function KulRequirement({
  nl,
  clientId,
  kulRequirement,
}: {
  nl: boolean;
  clientId: string;
  kulRequirement: Requirement;
}) {
  const [value, setValue] = useState<Requirement>(kulRequirement);
  const stricter =
    OPTIONS.findIndex((option) => option.value === value) >
    OPTIONS.findIndex((option) => option.value === kulRequirement);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4">
      <h2 className="text-sm font-semibold">{nl ? 'KU Leuven-login' : 'KU Leuven login'}</h2>
      <p className="mt-1 text-sm text-zinc-500">
        {nl
          ? 'Geldt bovenop de toegang hierboven. Wie er niet aan voldoet, wordt in de aanmeldflow tegengehouden en krijgt een knop om via KU Leuven aan te melden.'
          : 'Applies on top of the access above. Anyone who does not meet it is stopped in the sign-in flow and gets a button to sign in with KU Leuven.'}
      </p>

      <SaveForm
        action={setKulRequirementAction}
        submitLabel={nl ? 'Opslaan' : 'Save'}
        savingLabel={nl ? 'Opslaan…' : 'Saving…'}
        savedMessage={nl ? 'KU Leuven-vereiste bijgewerkt' : 'KU Leuven requirement updated'}
        fallbackErrorMessage={nl ? 'Opslaan mislukt' : 'Could not save'}
        className="mt-3 space-y-3"
      >
        <input type="hidden" name="clientId" value={clientId} />

        <div className="space-y-2">
          {OPTIONS.map((option) => {
            const [label, description] = nl ? option.nl : option.en;
            return (
              <label key={option.value} className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="kulRequirement"
                  value={option.value}
                  checked={value === option.value}
                  onChange={() => setValue(option.value)}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">{label}</span>
                  <span className="block text-zinc-500">{description}</span>
                </span>
              </label>
            );
          })}
        </div>

        {value === 'STUDENT' && (
          <p className="text-xs text-zinc-500">
            {nl
              ? 'Een doctoraatsonderzoeker die met een r-nummer inlogt, is niet van een andere student te onderscheiden en raakt dus wel binnen. Wie de KU Leuven-login koppelde voor deze controle bestond, moet eenmaal opnieuw via KU Leuven aanmelden.'
              : 'A doctoral researcher who signs in with an r-number cannot be told apart from other students and does get in. Anyone who linked a KU Leuven login before this check existed has to sign in with KU Leuven once more.'}
          </p>
        )}

        {stricter && (
          <p className="text-xs text-zinc-500">
            {nl
              ? 'Bij opslaan worden de lopende tokens ingetrokken van leden die hier niet aan voldoen. Een al uitgedeeld access token blijft geldig tot het vervalt.'
              : 'Saving revokes the current tokens of members who do not meet this. An access token already handed out stays valid until it expires.'}
          </p>
        )}
      </SaveForm>
    </section>
  );
}
