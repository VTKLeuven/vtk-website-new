"use client";

import { useId, useState } from "react";
import { Input, Label } from "@vtk/ui";
import { PAL_PLUS_LIMITS } from "@/lib/palPlus";

import "@/app/design/vtk-palplus-tags.css";

export type TagInputCopy = {
  label: string;
  help: string;
  placeholder: string;
  /** "Snel kiezen" boven de snelle tags. */
  presets: string;
  remove: string;
  /** Met `{max}`. */
  full: string;
};

/**
 * Tags kiezen voor een aanvraag of een sessie: de snelle tags van Onderwijs met
 * één tik, of zelf een tag intikken (Enter, komma of het veld verlaten). Wat al
 * gebruikt werd bij hetzelfde vak, komt als voorstel onder het veld, zodat
 * "Hoofdstuk 3" niet ook als "H3" en "hfst 3" rondgaat.
 *
 * De gekozen tags gaan als verborgen velden `tag` mee in het formulier; de
 * server ruimt ze nog eens op (`parsePalPlusTags`).
 */
export function TagInput({
  presets,
  suggestions,
  initial = [],
  copy,
}: {
  presets: string[];
  /** Tags die al gebruikt werden bij het gekozen vak. */
  suggestions: string[];
  initial?: string[];
  copy: TagInputCopy;
}) {
  const [tags, setTags] = useState<string[]>(initial);
  const [draft, setDraft] = useState("");
  const id = useId();
  const full = tags.length >= PAL_PLUS_LIMITS.tags;
  const same = (a: string, b: string) => a.toLocaleLowerCase("nl-BE") === b.toLocaleLowerCase("nl-BE");
  const has = (tag: string) => tags.some((other) => same(other, tag));

  function add(raw: string) {
    const tag = raw.replace(/\s+/g, " ").trim().slice(0, PAL_PLUS_LIMITS.tag);
    setDraft("");
    if (!tag || has(tag)) return;
    // Dezelfde schrijfwijze als een snelle tag of een voorstel, als die er is.
    const known = [...presets, ...suggestions].find((other) => same(other, tag));
    setTags((prev) => (prev.length >= PAL_PLUS_LIMITS.tags ? prev : [...prev, known ?? tag]));
  }

  const remove = (tag: string) => setTags((prev) => prev.filter((other) => !same(other, tag)));
  const toggle = (tag: string) => (has(tag) ? remove(tag) : add(tag));
  const openSuggestions = suggestions.filter((tag) => !has(tag) && !presets.some((preset) => preset === tag));

  return (
    <div className="pp-tags">
      <Label htmlFor={`${id}-input`}>{copy.label}</Label>
      {tags.map((tag) => (
        <input key={tag} type="hidden" name="tag" value={tag} />
      ))}

      {presets.length > 0 && (
        <div className="pp-tags-presets" role="group" aria-label={copy.presets}>
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-pressed={has(preset)}
              disabled={full && !has(preset)}
              onClick={() => toggle(preset)}
            >
              {preset}
            </button>
          ))}
        </div>
      )}

      {tags.some((tag) => !presets.includes(tag)) && (
        <ul className="pp-tags-chosen">
          {tags
            .filter((tag) => !presets.includes(tag))
            .map((tag) => (
              <li key={tag}>
                {tag}
                <button type="button" onClick={() => remove(tag)} aria-label={`${copy.remove}: ${tag}`} title={copy.remove}>
                  ×
                </button>
              </li>
            ))}
        </ul>
      )}

      <Input
        id={`${id}-input`}
        value={draft}
        onChange={(event) => {
          const value = event.target.value;
          if (value.endsWith(",")) add(value.slice(0, -1));
          else setDraft(value);
        }}
        onKeyDown={(event) => {
          // Enter maakt een tag, het verstuurt het formulier niet.
          if (event.key === "Enter") {
            event.preventDefault();
            add(draft);
          } else if (event.key === "Backspace" && !draft && tags.length > 0) {
            remove(tags[tags.length - 1]);
          }
        }}
        onBlur={() => draft && add(draft)}
        maxLength={PAL_PLUS_LIMITS.tag}
        placeholder={full ? copy.full.replace("{max}", String(PAL_PLUS_LIMITS.tags)) : copy.placeholder}
        disabled={full}
        autoComplete="off"
        aria-describedby={`${id}-help`}
      />

      {openSuggestions.length > 0 && !full && (
        <div className="pp-tags-suggest">
          {openSuggestions.slice(0, 8).map((tag) => (
            <button key={tag} type="button" onClick={() => add(tag)}>
              + {tag}
            </button>
          ))}
        </div>
      )}
      <p id={`${id}-help`} className="pp-tags-help">
        {copy.help}
      </p>
    </div>
  );
}
