"use client";

import { useState, useTransition } from "react";
import { LayoutList, Pencil, Plus } from "lucide-react";
import { Button } from "@vtk/ui";
import { deleteFormSectionAction, saveFormSectionAction } from "@/app/actions/formFields";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { IconButton } from "@/components/ui/IconButton";
import { useToast } from "@/components/ui/toast";
import type { AdminLocale } from "./format";

type Section = {
  id: string;
  titleNl: string;
  titleEn: string | null;
  descriptionNl: string | null;
  descriptionEn: string | null;
  fieldCount: number;
};

type SectionDraft = {
  id: string | null;
  titleNl: string;
  titleEn: string;
  descriptionNl: string;
  descriptionEn: string;
};

/**
 * Secties knippen een lang formulier in stukken en geven de voortgangsbalk haar
 * stappen. Ze zijn optioneel: zonder secties staat alles gewoon onder elkaar.
 */
export function SectionManager({
  locale,
  formId,
  sections,
}: {
  locale: AdminLocale;
  formId: string;
  sections: Section[];
}) {
  const nl = locale === "nl";
  const showToast = useToast();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<SectionDraft | null>(null);

  function save(current: SectionDraft) {
    startTransition(async () => {
      const state = await saveFormSectionAction(formId, {
        id: current.id,
        titleNl: current.titleNl,
        titleEn: current.titleEn || null,
        descriptionNl: current.descriptionNl || null,
        descriptionEn: current.descriptionEn || null,
      });
      if (state.status === "error") {
        showToast({
          message: nl ? "Sectie opslaan is niet gelukt." : "Saving the section failed.",
          variant: "error",
          duration: 0,
        });
        return;
      }
      showToast({ message: nl ? "Sectie opgeslagen" : "Section saved", variant: "success" });
      setDraft(null);
    });
  }

  return (
    <section className="ticket-admin-section" aria-labelledby="sections-heading">
      <div className="ticket-admin-section-head">
        <div className="ticket-admin-section-heading">
          <span className="ticket-admin-section-icon">
            <LayoutList aria-hidden="true" size={17} />
          </span>
          <div>
            <h2 id="sections-heading">{nl ? "Secties" : "Sections"}</h2>
            <p>
              {nl
                ? "Optioneel. Ze maken een lang formulier leesbaar en tonen de bezoeker zijn voortgang."
                : "Optional. They make a long form readable and show the visitor their progress."}
            </p>
          </div>
        </div>
      </div>

      {sections.length > 0 ? (
        <ul className="ticket-admin-list">
          {sections.map((section) => (
            <li key={section.id}>
              <div className="ticket-admin-row-head">
                <div>
                  <p className="ticket-admin-row-title">{section.titleNl}</p>
                  <p className="ticket-admin-row-meta">
                    {section.fieldCount} {nl ? "velden" : "fields"}
                    {section.titleEn ? "" : ` · ${nl ? "geen vertaling" : "no translation"}`}
                  </p>
                </div>
                <div className="ticket-admin-row-actions">
                  <IconButton
                    label={nl ? "Bewerken" : "Edit"}
                    srLabel={`${nl ? "Bewerken" : "Edit"}: ${section.titleNl}`}
                    onClick={() =>
                      setDraft({
                        id: section.id,
                        titleNl: section.titleNl,
                        titleEn: section.titleEn ?? "",
                        descriptionNl: section.descriptionNl ?? "",
                        descriptionEn: section.descriptionEn ?? "",
                      })
                    }
                  >
                    <Pencil size={16} aria-hidden="true" />
                  </IconButton>
                  <DeleteIconButton
                    action={deleteFormSectionAction}
                    fields={{ formId, sectionId: section.id }}
                    label={nl ? "Sectie verwijderen" : "Delete section"}
                    srLabel={`${nl ? "Sectie verwijderen" : "Delete section"}: ${section.titleNl}`}
                    title={nl ? "Sectie verwijderen?" : "Delete section?"}
                    description={
                      section.fieldCount > 0
                        ? nl
                          ? `De ${section.fieldCount} velden in deze sectie blijven bestaan en schuiven naar het deel bovenaan het formulier. Er gaan geen antwoorden verloren.`
                          : `The ${section.fieldCount} fields in this section stay and move to the part at the top of the form. No answers are lost.`
                        : nl
                          ? "Deze sectie is leeg."
                          : "This section is empty."
                    }
                    confirmLabel={nl ? "Verwijderen" : "Delete"}
                    cancelLabel={nl ? "Annuleren" : "Cancel"}
                    successMessage={nl ? "Sectie verwijderd" : "Section deleted"}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {draft ? (
        <div className="form-admin-fieldset">
          <div className="ticket-admin-form-grid">
            <div className="ticket-admin-field">
              <label htmlFor="section-title-nl">{nl ? "Titel (NL)" : "Title (NL)"}</label>
              <input
                id="section-title-nl"
                value={draft.titleNl}
                maxLength={300}
                onChange={(event) => setDraft({ ...draft, titleNl: event.target.value })}
              />
            </div>
            <div className="ticket-admin-field">
              <label htmlFor="section-title-en">{nl ? "Titel (EN)" : "Title (EN)"}</label>
              <input
                id="section-title-en"
                value={draft.titleEn}
                maxLength={300}
                onChange={(event) => setDraft({ ...draft, titleEn: event.target.value })}
              />
            </div>
            <div className="ticket-admin-field" data-span="2">
              <label htmlFor="section-description-nl">
                {nl ? "Beschrijving (NL)" : "Description (NL)"}
              </label>
              <textarea
                id="section-description-nl"
                rows={2}
                value={draft.descriptionNl}
                maxLength={2_000}
                onChange={(event) => setDraft({ ...draft, descriptionNl: event.target.value })}
              />
            </div>
            <div className="ticket-admin-field" data-span="2">
              <label htmlFor="section-description-en">
                {nl ? "Beschrijving (EN)" : "Description (EN)"}
              </label>
              <textarea
                id="section-description-en"
                rows={2}
                value={draft.descriptionEn}
                maxLength={2_000}
                onChange={(event) => setDraft({ ...draft, descriptionEn: event.target.value })}
              />
            </div>
          </div>
          <div className="ticket-admin-row-actions">
            <Button
              type="button"
              onClick={() => save(draft)}
              disabled={pending || !draft.titleNl.trim()}
            >
              {pending ? (nl ? "Bezig..." : "Saving...") : nl ? "Sectie opslaan" : "Save section"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setDraft(null)} disabled={pending}>
              {nl ? "Annuleren" : "Cancel"}
            </Button>
          </div>
        </div>
      ) : (
        <button
          className="ticket-admin-button"
          type="button"
          onClick={() =>
            setDraft({ id: null, titleNl: "", titleEn: "", descriptionNl: "", descriptionEn: "" })
          }
        >
          <Plus aria-hidden="true" size={15} />
          {nl ? "Sectie toevoegen" : "Add section"}
        </button>
      )}
    </section>
  );
}
