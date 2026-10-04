"use client";

import Link from "@/components/ui/Link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Input, Label, Select, Textarea } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import type { SaveAction } from "@/lib/saveState";
import { countWords } from "@/lib/rekeningen/expenses";
import { ReceiptField } from "./ReceiptField";

/**
 * Eén keuze in de postlijst. `id` is de waarde van de optie: een `groupId`, of
 * `groupId:Deelpost` voor een opgesplitste post (zie `postOptionValue`).
 */
export type PostOption = { id: string; name: string };

export type ExpenseFormValues = {
  id?: string;
  groupId: string;
  payerName: string;
  activity: string;
  description: string;
  comment: string;
  spentOn: string;
  amount: string;
  paymentMethod: "VTK_CARD" | "PERSONAL";
  iban: string;
};

export type ExpenseFormLabels = {
  submitLabel: string;
  savingLabel: string;
  savedMessage: string;
  fallbackErrorMessage: string;
  errorMessages: Record<string, string>;
};

/**
 * Het rekeningenblad zelf: dezelfde velden als in billsheet, in dezelfde
 * volgorde, want dat is wat op het papieren blad van de boekhouder staat.
 *
 * Wordt gebruikt om in te dienen én om te bewerken; het verschil zit in de
 * action en in het bestaande bonnetje dat meegegeven wordt.
 */
export function ExpenseForm({
  locale,
  action,
  labels,
  posts,
  values,
  existingReceipt,
  redirectAfter,
  defaultIbanHref,
  maxWords,
}: {
  locale: "nl" | "en";
  action: SaveAction;
  labels: ExpenseFormLabels;
  posts: PostOption[];
  values: ExpenseFormValues;
  existingReceipt?: {
    key: string;
    name: string;
    mime: string;
    size: number;
    previewUrl: string;
  };
  /** Waar we heen gaan na een geslaagde opslag. Leeg = op de pagina blijven. */
  redirectAfter?: string;
  /** Waar de indiener zijn eigen standaard-IBAN aanpast: onder Mijn rekeningen. */
  defaultIbanHref?: string;
  /** Hoeveel woorden activiteit en omschrijving elk mogen tellen. */
  maxWords: number;
}) {
  const nl = locale === "nl";
  const router = useRouter();
  const [paymentMethod, setPaymentMethod] = useState(values.paymentMethod);
  const isEdit = Boolean(values.id);

  // De betaalwijze is een gecontroleerd veld, dus `form.reset()` na een geslaagde
  // indiening raakt ze niet. Zonder dit stond het volgende bonnetje nog op
  // "Persoonlijk" met het IBAN-veld open, terwijl de rest van het formulier leeg
  // was. Billsheet zette hem hier ook terug op de kaart van VTK.
  const methodRef = useRef<HTMLSelectElement>(null);
  const initialMethod = useRef(values.paymentMethod);
  useEffect(() => {
    const form = methodRef.current?.form;
    if (!form) return;
    const onReset = () => setPaymentMethod(initialMethod.current);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  return (
    <SaveForm
      action={action}
      submitLabel={labels.submitLabel}
      savingLabel={labels.savingLabel}
      savedMessage={labels.savedMessage}
      errorMessages={labels.errorMessages}
      fallbackErrorMessage={labels.fallbackErrorMessage}
      // Bij bewerken moeten de ingevulde waarden blijven staan; bij een nieuwe
      // rekening hoort het formulier leeg te zijn voor het volgende bonnetje.
      resetOnSuccess={!isEdit}
      onSuccess={() => {
        if (redirectAfter) router.push(redirectAfter);
        else router.refresh();
      }}
      className="space-y-5"
    >
      {values.id && <input type="hidden" name="id" value={values.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="payerName">{nl ? "Wie betaalde" : "Who paid"}</Label>
          <Input
            id="payerName"
            name="payerName"
            required
            maxLength={120}
            defaultValue={values.payerName}
          />
          <p className="mt-1 text-xs text-[#5c667f]">
            {nl
              ? "Deze naam komt op het blad. Dien je iets in voor iemand anders, zet dan diens naam."
              : "This name goes on the sheet. Submitting for someone else? Put their name."}
          </p>
        </div>
        <div>
          <Label htmlFor="groupId">{nl ? "Post" : "Post"}</Label>
          <Select id="groupId" name="groupId" required defaultValue={values.groupId}>
            <option value="">{nl ? "Kies een post..." : "Choose a post..."}</option>
            {posts.map((post) => (
              <option key={post.id} value={post.id}>
                {post.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="spentOn">{nl ? "Datum uitgave" : "Date of expense"}</Label>
          <Input
            id="spentOn"
            name="spentOn"
            type="date"
            required
            defaultValue={values.spentOn}
          />
        </div>
        <WordLimitedField
          id="activity"
          label={nl ? "Activiteit" : "Activity"}
          locale={locale}
          maxWords={maxWords}
          maxLength={160}
          defaultValue={values.activity}
          placeholder={nl ? "bv. Doopcantus" : "e.g. Initiation cantus"}
        />
      </div>

      <WordLimitedField
        id="description"
        label={nl ? "Omschrijving" : "Description"}
        locale={locale}
        maxWords={maxWords}
        maxLength={200}
        defaultValue={values.description}
        placeholder={nl ? "bv. Bierbestelling" : "e.g. Beer order"}
      />

      <div>
        <Label htmlFor="comment">{nl ? "Opmerking (optioneel)" : "Comment (optional)"}</Label>
        <Textarea
          id="comment"
          name="comment"
          rows={3}
          maxLength={4000}
          defaultValue={values.comment}
          placeholder={
            nl
              ? "Wat er verder te weten valt: waarvoor precies, voor wie, waarom dit bedrag."
              : "Anything else worth knowing: what exactly, for whom, why this amount."
          }
        />
        <p className="mt-1 text-xs text-[#5c667f]">
          {nl
            ? "Komt niet op het blad en niet in de bestandsnaam, maar Beheer ziet ze bij de rekening."
            : "Does not go on the sheet or in the file name, but Administration sees it with the expense."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="amount">{nl ? "Bedrag" : "Amount"}</Label>
          <Input
            id="amount"
            name="amount"
            required
            inputMode="decimal"
            maxLength={20}
            defaultValue={values.amount}
            placeholder="10,23"
          />
        </div>
        <div>
          <Label htmlFor="paymentMethod">{nl ? "Betaalwijze" : "Payment method"}</Label>
          <Select
            ref={methodRef}
            id="paymentMethod"
            name="paymentMethod"
            required
            value={paymentMethod}
            onChange={(event) =>
              setPaymentMethod(event.target.value as ExpenseFormValues["paymentMethod"])
            }
          >
            <option value="VTK_CARD">{nl ? "Kaart VTK" : "VTK card"}</option>
            <option value="PERSONAL">{nl ? "Persoonlijk" : "Personal"}</option>
          </Select>
        </div>
      </div>

      {paymentMethod === "PERSONAL" && (
        <div>
          <Label htmlFor="iban">{nl ? "Rekeningnummer (IBAN)" : "Account number (IBAN)"}</Label>
          <Input
            id="iban"
            name="iban"
            required
            maxLength={40}
            defaultValue={values.iban}
            placeholder="BE68 5390 0754 7034"
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-[#5c667f]">
            {nl
              ? "Hier komt de terugbetaling op. Je kan voor deze rekening afwijken zonder je standaard-IBAN te wijzigen."
              : "This is where the reimbursement goes. You can override it for this expense without changing your default IBAN."}{" "}
            {defaultIbanHref ? (
              <Link href={defaultIbanHref} className="font-medium text-vtk-ink underline">
                {nl ? "Standaard-IBAN wijzigen" : "Change default IBAN"}
              </Link>
            ) : null}
          </p>
        </div>
      )}

      <ReceiptField locale={locale} existing={existingReceipt} />
    </SaveForm>
  );
}

/**
 * Een kort tekstveld met een woordenteller. Activiteit en omschrijving staan in
 * de bestandsnaam van het blad, dus ze zijn beperkt tot een paar woorden.
 *
 * Een rekening van voor die grens mag haar langere tekst houden: de grens geldt
 * pas wanneer je het veld wijzigt, net zoals de server het toetst.
 */
function WordLimitedField({
  id,
  label,
  locale,
  maxWords,
  maxLength,
  defaultValue,
  placeholder,
}: {
  id: string;
  label: string;
  locale: "nl" | "en";
  maxWords: number;
  maxLength: number;
  defaultValue: string;
  placeholder: string;
}) {
  const nl = locale === "nl";
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);
  const words = countWords(value);
  const tooLong = words > maxWords && value.trim() !== defaultValue.trim();

  // Na een geslaagde indiening zet `SaveForm` het formulier terug; de teller
  // moet dan mee terug naar nul.
  useEffect(() => {
    const input = inputRef.current;
    const form = input?.form;
    if (!input || !form) return;
    const onReset = () => setValue(input.defaultValue);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  const message = nl
    ? `Maximaal ${maxWords} ${maxWords === 1 ? "woord" : "woorden"}; meer uitleg kan in de opmerking.`
    : `At most ${maxWords} ${maxWords === 1 ? "word" : "words"}; more detail goes in the comment.`;

  // De browser houdt het formulier dan zelf tegen, met deze melding bij het
  // veld, nog voor er iets naar de server gaat.
  useEffect(() => {
    inputRef.current?.setCustomValidity(tooLong ? message : "");
  }, [tooLong, message]);

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        ref={inputRef}
        id={id}
        name={id}
        required
        maxLength={maxLength}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-invalid={tooLong || undefined}
        aria-describedby={`${id}-words`}
        onChange={(event) => setValue(event.target.value)}
      />
      {/* Een div en geen p: vtk-admin.css kleurt elke p in de admin grijs met
          !important, en dan zag je niet dat je over de grens ging. */}
      <div
        id={`${id}-words`}
        className={`mt-1 flex justify-between gap-3 text-xs ${tooLong ? "font-medium text-red-700" : "text-[#5c667f]"}`}
      >
        <span>{message}</span>
        <span className="shrink-0 tabular-nums">
          {words}/{maxWords}
        </span>
      </div>
    </div>
  );
}
