"use client";

import { useState } from "react";
import { Input, Label } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { ThemedSelect } from "@/components/ui/ThemedSelect";
import { IconButton } from "@/components/ui/IconButton";
import { CloseIcon } from "@/components/ui/icons";
import { SearchPicker, type SearchPickerOption } from "@/components/admin/SearchPicker";
import type { CategoryOption } from "@/lib/google/mailGroupOptions";
import type { MemberCandidate } from "../actions";
import { createMailGroupAction } from "../actions";
import { CandidateBadge, MemberPicker, candidateValue } from "../[id]/MemberPicker";

type Werkgroep = { id: string; name: string; prefix: string | null };
type ChosenSource = { value: string; label: string; onlyLead: boolean };

/**
 * Het formulier van "Nieuw groepsadres". Alles gaat in één keer mee; de
 * action maakt de groep met haar bronnen en leden en opent dan de detailpagina,
 * en die navigatie is de bevestiging.
 *
 * Een werkgroep kiest enkel het stuk na haar voorvoegsel: statix. + pr wordt
 * statix.pr@vtk.be. Zo kan ze geen adres maken dat op een post lijkt.
 */
export function NewMailGroupForm({
  nl,
  domain,
  manageAll,
  werkgroepen,
  sourceOptions,
  categoryOptions,
}: {
  nl: boolean;
  domain: string;
  manageAll: boolean;
  werkgroepen: Werkgroep[];
  sourceOptions: SearchPickerOption[];
  categoryOptions: CategoryOption[];
}) {
  const [ownerId, setOwnerId] = useState(manageAll ? "" : (werkgroepen[0]?.id ?? ""));
  const owner = werkgroepen.find((w) => w.id === ownerId) ?? null;
  const [sources, setSources] = useState<ChosenSource[]>([]);
  const [onlyLead, setOnlyLead] = useState(false);
  const [members, setMembers] = useState<MemberCandidate[]>([]);

  const errorMessages = nl
    ? {
        DUPLICATE_EMAIL: "Niet aangemaakt: dat adres bestaat al.",
        INVALID_EMAIL: "Niet aangemaakt: het adres of een van de leden is geen geldig adres.",
        WRONG_PREFIX: "Niet aangemaakt: een werkgroep maakt enkel adressen met haar eigen voorvoegsel.",
        INVALID_INPUT: "Niet aangemaakt: een bron, lid of categorie bestaat niet meer. Herlaad de pagina.",
      }
    : {
        DUPLICATE_EMAIL: "Not created: that address already exists.",
        INVALID_EMAIL: "Not created: the address or one of the members is not a valid address.",
        WRONG_PREFIX: "Not created: a work group only creates addresses with its own prefix.",
        INVALID_INPUT: "Not created: a source, member or category no longer exists. Reload the page.",
      };

  function addSource(value: string) {
    const option = sourceOptions.find((o) => o.value === value);
    if (!option) return;
    const label = `${option.group && option.group !== option.label ? `${option.group}: ` : ""}${option.label}`;
    setSources((prev) =>
      prev.some((s) => s.value === value && s.onlyLead === onlyLead) ? prev : [...prev, { value, label, onlyLead }],
    );
  }

  return (
    <SaveForm
      action={createMailGroupAction}
      submitLabel={nl ? "Groepsadres aanmaken" : "Create group address"}
      savingLabel={nl ? "Bezig met aanmaken..." : "Creating..."}
      savedMessage={nl ? "Groepsadres aangemaakt." : "Group address created."}
      errorMessages={errorMessages}
      fallbackErrorMessage={nl ? "Aanmaken is mislukt." : "Creating failed."}
      resetOnSuccess={false}
      className="space-y-5"
    >
      <input type="hidden" name="locale" value={nl ? "nl" : "en"} />
      {sources.map((s) => (
        <input key={`${s.value}|${s.onlyLead}`} type="hidden" name="source" value={`${s.value}${s.onlyLead ? "|lead" : ""}`} />
      ))}
      {members.map((m) => (
        <input key={candidateValue(m)} type="hidden" name="member" value={candidateValue(m)} />
      ))}

      <Section title={nl ? "Adres" : "Address"}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>{nl ? "Adres" : "Address"}</Label>
            {owner && !manageAll ? (
              <div className="flex items-center gap-1 text-sm">
                <span className="text-zinc-500">{owner.prefix}.</span>
                <Input name="localPart" placeholder="pr" required className="flex-1" />
                <span className="text-zinc-500">@{domain}</span>
              </div>
            ) : (
              <Input
                name="email"
                type="email"
                placeholder={owner?.prefix ? `${owner.prefix}.pr@${domain}` : `activiteiten@${domain}`}
                required
              />
            )}
          </div>
          <div>
            <Label>{nl ? "Naam" : "Name"}</Label>
            <Input name="name" placeholder={owner ? `${owner.name} PR` : "Activiteiten"} required />
          </div>
          <div className="sm:col-span-2">
            <Label>{nl ? "Omschrijving" : "Description"}</Label>
            <Input name="description" placeholder={nl ? "Waarvoor dient dit adres?" : "What is this address for?"} />
          </div>
        </div>
      </Section>

      {manageAll && (
        <Section
          title={nl ? "Wie erin zit" : "Who is in it"}
          hint={
            nl
              ? "Een bron volgt de post of groep door de jaren heen; een los lid blijft staan tot je het weghaalt. Allebei kan je later nog aanpassen."
              : "A source follows the post or group through the years; a loose member stays until you remove it. You can change both later."
          }
        >
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="space-y-2">
              <Label>{nl ? "Bronnen" : "Sources"}</Label>
              <SearchPicker
                options={sourceOptions}
                value=""
                onChange={addSource}
                placeholder={nl ? "Post, werkgroep, POC of kiesploeg toevoegen" : "Add a post, work group, POC or kiesploeg"}
                searchPlaceholder={nl ? "Zoek, bv. Cultuur" : "Search, e.g. Cultuur"}
                ariaLabel={nl ? "Bron toevoegen" : "Add a source"}
                emptyText={(q) => (nl ? `Geen bron "${q}".` : `No source "${q}".`)}
              />
              <label className="flex items-center gap-2 text-sm text-zinc-600">
                <input type="checkbox" checked={onlyLead} onChange={(e) => setOnlyLead(e.target.checked)} />
                {nl ? "Enkel de verantwoordelijke van wat ik nu toevoeg" : "Only the lead of what I add next"}
              </label>
              <ChosenList
                nl={nl}
                empty={nl ? "Nog geen bronnen." : "No sources yet."}
                items={sources.map((s) => ({
                  key: `${s.value}|${s.onlyLead}`,
                  title: s.label,
                  sub: s.onlyLead ? (nl ? "enkel de verantwoordelijke" : "only the lead") : null,
                  badge: null,
                }))}
                onRemove={(key) => setSources((prev) => prev.filter((s) => `${s.value}|${s.onlyLead}` !== key))}
              />
            </div>
            <div className="space-y-2">
              <MemberPicker
                nl={nl}
                label={nl ? "Losse leden" : "Loose members"}
                onPick={(c) =>
                  setMembers((prev) => (prev.some((m) => candidateValue(m) === candidateValue(c)) ? prev : [...prev, c]))
                }
              />
              <ChosenList
                nl={nl}
                empty={nl ? "Nog geen losse leden." : "No loose members yet."}
                items={members.map((m) => ({
                  key: candidateValue(m),
                  title: m.source === "site" ? m.name : m.email,
                  sub:
                    m.source === "site"
                      ? m.vtk ?? (nl ? `${m.siteEmail} · geen @vtk.be-account gekoppeld` : `${m.siteEmail} · no @vtk.be account linked`)
                      : m.source === "gw"
                        ? m.name
                        : null,
                  badge: <CandidateBadge source={m.source} />,
                }))}
                onRemove={(key) => setMembers((prev) => prev.filter((m) => candidateValue(m) !== key))}
              />
            </div>
          </div>
        </Section>
      )}

      <Section title={nl ? "Instellingen" : "Settings"}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {manageAll && (
            <div>
              <Label>{nl ? "Categorie" : "Category"}</Label>
              <SearchPicker
                name="categoryId"
                onChange={(value) => {
                  // Een categorie van een werkgroep stelt die werkgroep voor,
                  // zolang er nog geen gekozen is.
                  const categoryOwner = categoryOptions.find((c) => c.value === value)?.ownerId;
                  if (!ownerId && categoryOwner && werkgroepen.some((w) => w.id === categoryOwner)) {
                    setOwnerId(categoryOwner);
                  }
                }}
                options={[{ value: "", label: nl ? "Zonder categorie" : "No category", muted: true }, ...categoryOptions]}
                placeholder={nl ? "Zonder categorie" : "No category"}
                searchPlaceholder={nl ? "Zoek een categorie" : "Search a category"}
                ariaLabel={nl ? "Categorie" : "Category"}
                emptyText={(q) => (nl ? `Geen categorie "${q}".` : `No category "${q}".`)}
              />
            </div>
          )}
          {werkgroepen.length > 0 && (
            <div>
              <Label>{nl ? "Werkgroep" : "Work group"}</Label>
              <ThemedSelect
                name="ownerGroupId"
                value={ownerId}
                onChange={setOwnerId}
                required={!manageAll}
                options={[
                  ...(manageAll ? [{ value: "", label: nl ? "Geen (enkel IT)" : "None (IT only)" }] : []),
                  ...werkgroepen.map((w) => ({ value: w.id, label: w.prefix ? `${w.name} (${w.prefix}.)` : w.name })),
                ]}
              />
              <p className="mt-1 text-xs text-zinc-500">
                {nl ? "De werkgroep beheert dan zelf de leden van dit adres." : "That work group then manages this address's members itself."}
              </p>
            </div>
          )}
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm text-zinc-700">
          <input type="checkbox" name="allowExternalSenders" defaultChecked className="mt-1" />
          <span>
            {nl ? "Mail van buiten vtk.be toelaten" : "Allow mail from outside vtk.be"}
            <span className="block text-xs text-zinc-500">
              {nl
                ? "Aan voor elk adres waar bedrijven, profs of studenten naartoe mailen. Uit voor een interne lijst."
                : "On for every address companies, professors or students mail. Off for an internal list."}
            </span>
          </span>
        </label>
      </Section>
    </SaveForm>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-vtk-blue/15 bg-white p-5">
      <h3 className="text-sm font-semibold text-vtk-ink">{title}</h3>
      {hint && <p className="mt-0.5 max-w-3xl text-xs text-zinc-500">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ChosenList({
  nl,
  empty,
  items,
  onRemove,
}: {
  nl: boolean;
  empty: string;
  items: { key: string; title: string; sub: string | null; badge: React.ReactNode }[];
  onRemove: (key: string) => void;
}) {
  if (items.length === 0) return <p className="text-sm text-zinc-400">{empty}</p>;
  return (
    <ul className="divide-y divide-vtk-blue/5 rounded-xl border border-vtk-blue/10">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-3 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1">
            <span className="block break-all text-vtk-ink">{item.title}</span>
            {item.sub && <span className="block text-xs text-zinc-500">{item.sub}</span>}
          </span>
          {item.badge}
          <IconButton
            label={nl ? "Weghalen" : "Remove"}
            srLabel={nl ? `Weghalen: ${item.title}` : `Remove: ${item.title}`}
            onClick={() => onRemove(item.key)}
          >
            <CloseIcon />
          </IconButton>
        </li>
      ))}
    </ul>
  );
}
