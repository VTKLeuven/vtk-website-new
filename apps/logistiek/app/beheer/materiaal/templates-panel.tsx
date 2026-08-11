'use client';

import { useState } from 'react';
import { deleteTemplateAction, renameTemplateAction } from '@/app/actions/beheer';
import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { LogisticsIcon } from '@/components/logistics-icon';
import { SaveForm } from '@/components/ui/save-form';
import type { AdminRequestTemplate } from '@/lib/uitleen-server';

/**
 * De sjablonen, met hun inhoud.
 *
 * Aanmaken gebeurt hier niet: dat doe je vanaf een bestaande aanvraag
 * ("Bewaar als sjabloon"). Hier hernoem je ze en ruim je op; dat is wat er na een
 * jaar nodig blijkt, niet nog een invulscherm.
 */
const ERRORS = { NAME_REQUIRED: 'Geef het sjabloon een naam.' };

export function TemplatesPanel({ templates }: { templates: AdminRequestTemplate[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
      <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">Sjablonen</h2>
      <p className="mt-1 text-sm text-vtk-muted">
        Vaste sets die leden in één klik in het aanvraagformulier zetten. Maak er een
        vanaf een bestaande aanvraag, met &ldquo;Bewaar als sjabloon&rdquo;.
      </p>

      {templates.length === 0 ? (
        <p className="mt-4 text-sm text-vtk-muted">
          Nog geen sjablonen. Open een aanvraag die vaker terugkomt en bewaar ze daar.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-vtk-navy/10">
          {templates.map((template) => {
            const editing = editingId === template.id;
            const inactive = template.lines.filter((line) => !line.item.active).length;
            return (
              <li key={template.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-vtk-ink">
                      {template.name}
                      {template.group ? (
                        <span className="ml-2 rounded-full bg-vtk-paper-2 px-2 py-0.5 text-[11px] font-semibold text-vtk-navy">
                          {template.group.nameNl}
                        </span>
                      ) : null}
                    </p>
                    {template.description ? (
                      <p className="text-sm text-vtk-muted">{template.description}</p>
                    ) : null}
                    <p className="mt-0.5 text-sm text-vtk-muted">
                      {template.lines
                        .map((line) => `${line.quantity}× ${line.item.name}`)
                        .join(', ') || 'Geen items'}
                    </p>
                    {inactive > 0 ? (
                      <p className="mt-0.5 text-xs text-amber-800">
                        {inactive === 1
                          ? '1 item staat niet meer in de catalogus en wordt overgeslagen.'
                          : `${inactive} items staan niet meer in de catalogus en worden overgeslagen.`}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId(editing ? null : template.id)}
                      aria-expanded={editing}
                      className="rounded-full border border-vtk-navy/15 px-3 py-1.5 text-sm font-semibold text-vtk-ink transition hover:border-vtk-navy/40 hover:bg-vtk-paper"
                    >
                      {editing ? 'Sluiten' : 'Hernoemen'}
                    </button>
                    <ConfirmActionButton
                      label={`Verwijderen: ${template.name}`}
                      confirmLabel="Verwijderen"
                      icon={<LogisticsIcon name="close" className="h-4 w-4" />}
                      action={deleteTemplateAction.bind(null, template.id)}
                      successMessage="Sjabloon verwijderd."
                      destructive
                      dialogTitle="Sjabloon verwijderen?"
                      dialogDescription={`"${template.name}" verdwijnt uit het aanvraagformulier. Aanvragen die er ooit mee gestart zijn, blijven gewoon bestaan; een sjabloon vult enkel het formulier in.`}
                    />
                  </div>
                </div>

                {editing ? (
                  <SaveForm
                    action={renameTemplateAction}
                    submitLabel="Opslaan"
                    savingLabel="Opslaan..."
                    savedMessage="Sjabloon bijgewerkt."
                    errorMessages={ERRORS}
                    onSuccess={() => setEditingId(null)}
                    className="mt-3 grid gap-2 rounded-[12px] bg-vtk-paper p-3 sm:grid-cols-2"
                  >
                    <input type="hidden" name="templateId" value={template.id} />
                    <label className="grid gap-1 text-xs font-medium text-vtk-muted">
                      Naam
                      <input
                        type="text"
                        name="name"
                        defaultValue={template.name}
                        className="h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-medium text-vtk-muted">
                      Toelichting
                      <input
                        type="text"
                        name="description"
                        defaultValue={template.description ?? ''}
                        className="h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink"
                      />
                    </label>
                  </SaveForm>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
