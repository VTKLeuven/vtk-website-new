"use client";

import type { ComponentProps } from "react";
import { SaveForm as SharedSaveForm } from "@vtk/ui/save-form";
import {
  FormTranslateControl,
  FormTranslateProvider,
  useFormTranslateRegistry,
} from "@/components/ui/formTranslate";

/**
 * Formulier dat de uitkomst van zijn opslaan-actie als toast meldt. De basis staat
 * sinds november 2026 in `@vtk/ui/save-form`, gedeeld met de uitleendienst; dit
 * blijft het adres voor vtk.be (zie CLAUDE.md, "Opslaan meldt altijd zijn uitkomst").
 *
 * Wat enkel vtk.be heeft, komt er hier bij als `extension`: de AI-vertaalknop
 * (`formTranslate.tsx`). Velden melden zich aan bij de provider rond het
 * formulier, en de knop staat na de opslaanknoppen, tenzij een tweetalig blok zijn
 * eigen knop heeft of `disableAutoTranslate` aan staat.
 */
export function SaveForm({
  disableAutoTranslate = false,
  ...props
}: Omit<ComponentProps<typeof SharedSaveForm>, "extension"> & {
  /** Verberg de automatische AI-vertaalknop voor dit formulier. */
  disableAutoTranslate?: boolean;
}) {
  const { fieldsRef, version, hasInlineTranslate, register, markInlinePresent } =
    useFormTranslateRegistry();

  return (
    <SharedSaveForm
      {...props}
      extension={{
        wrap: (content) => (
          <FormTranslateProvider register={register} markInlinePresent={markInlinePresent}>
            {content}
          </FormTranslateProvider>
        ),
        extraButton:
          disableAutoTranslate || hasInlineTranslate
            ? undefined
            : ({ pending, formRef }) => (
                <FormTranslateControl
                  formRef={formRef}
                  registeredFieldsRef={fieldsRef}
                  registryVersion={version}
                  disabled={pending}
                />
              ),
      }}
    />
  );
}
