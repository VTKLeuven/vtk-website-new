'use client';

import { useState } from 'react';
import { deleteTemplateAction } from '@/app/actions/beheer';
import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { LogisticsIcon } from '@/components/logistics-icon';
import { TemplateEditor, type TemplateDraft } from './template-editor';
import type { AdminRequestTemplate, CatalogCategory } from '@/lib/uitleen-server';

/**
 * De sjablonen: vaste materiaallijsten die leden in één klik in het
 * aanvraagformulier zetten.
 *
 * Er zijn twee wegen om er een te maken, en dat is met opzet. Vanaf een bestaande
 * aanvraag ("Bewaar als sjabloon" op de aanvraagpagina) is de gewone: je maakt
 * een sjabloon meestal omdat je merkt dat dezelfde lijst terugkomt. Met de hand
 * is voor het opzetten van nul, want dan bestaat die aanvraag nog niet en zou je
 * nepaanvragen moeten indienen om eraan te geraken.
 */
export function TemplatesManager({
  templates,
  catalog,
}: {
  templates: AdminRequestTemplate[];
  catalog: CatalogCategory[];
}) {
  /** `null` = niets open, `'new'` = een nieuw sjabloon, anders een template-id. */
  const [editing, setEditing] = useState<string | null>(null);

  const draftFor = (template: AdminRequestTemplate): TemplateDraft => ({
    id: template.id,
    name: template.name,
    description: template.description ?? '',
    quantities: Object.fromEntries(
      // Enkel lijnen waarvan het item nog in de catalogus staat: de kiezer kent
      // de andere niet en zou ze bij het opslaan toch laten vallen.
      template.lines
        .filter((line) => line.item.active)
        .map((line) => [line.itemId, line.quantity])
    ),
  });

  return (
    <div className="grid gap-6">
      <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-vtk-ink">Sjablonen</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-vtk-body">
              Vaste sets die leden bovenaan het aanvraagformulier in één klik kunnen invullen. Een
              sjabloon bevat enkel materiaal: geen datums, geen evenement. Maak er een met de hand,
              of vanaf een aanvraag die vaker terugkomt met &ldquo;Bewaar als sjabloon&rdquo;.
            </p>
          </div>
          {editing === null ? (
            <button
              type="button"
              onClick={() => setEditing('new')}
              className="rounded-full bg-vtk-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-vtk-ink"
            >
              Nieuw sjabloon
            </button>
          ) : null}
        </div>
      </section>

      {editing === 'new' ? (
        <TemplateEditor
          catalog={catalog}
          onDone={() => setEditing(null)}
          onCancel={() => setEditing(null)}
        />
      ) : null}

      {templates.length === 0 ? (
        <p className="rounded-[16px] border border-dashed border-vtk-navy/20 bg-vtk-surface px-5 py-5 text-sm text-vtk-muted">
          Nog geen sjablonen. Maak er een met &ldquo;Nieuw sjabloon&rdquo;, of bewaar een aanvraag
          die vaker terugkomt als sjabloon.
        </p>
      ) : (
        <ul className="grid gap-3">
          {templates.map((template) => {
            const open = editing === template.id;
            const inactive = template.lines.filter((line) => !line.item.active).length;
            return (
              <li
                key={template.id}
                className="rounded-[16px] border border-vtk-navy/10 bg-vtk-surface p-5"
              >
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
                      onClick={() => setEditing(open ? null : template.id)}
                      aria-expanded={open}
                      className="rounded-full border border-vtk-navy/15 px-3 py-1.5 text-sm font-semibold text-vtk-ink transition hover:border-vtk-navy/40 hover:bg-vtk-paper"
                    >
                      {open ? 'Sluiten' : 'Aanpassen'}
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

                {open ? (
                  <div className="mt-4">
                    <TemplateEditor
                      catalog={catalog}
                      initial={draftFor(template)}
                      onDone={() => setEditing(null)}
                      onCancel={() => setEditing(null)}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
