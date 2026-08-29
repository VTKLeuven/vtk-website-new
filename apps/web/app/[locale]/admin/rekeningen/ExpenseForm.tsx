"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Input, Label, Select } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import type { SaveAction } from "@/lib/saveState";
import { ReceiptField } from "./ReceiptField";

export type PostOption = { id: string; name: string };

export type ExpenseFormValues = {
  id?: string;
  groupId: string;
  payerName: string;
  activity: string;
  description: string;
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
        <div>
          <Label htmlFor="activity">{nl ? "Activiteit" : "Activity"}</Label>
          <Input
            id="activity"
            name="activity"
            required
            maxLength={160}
            defaultValue={values.activity}
            placeholder={nl ? "bv. Doopcantus" : "e.g. Initiation cantus"}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="description">{nl ? "Omschrijving" : "Description"}</Label>
        <Input
          id="description"
          name="description"
          required
          maxLength={200}
          defaultValue={values.description}
          placeholder={nl ? "bv. Bierbestelling" : "e.g. Beer order"}
        />
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
              ? "Hier komt de terugbetaling op. Het nummer hoort bij deze rekening en wordt niet bij je profiel bewaard."
              : "This is where the reimbursement goes. The number belongs to this expense and is not stored on your profile."}
          </p>
        </div>
      )}

      <ReceiptField locale={locale} existing={existingReceipt} />
    </SaveForm>
  );
}
