"use client";

import { useEffect, useId, useRef, useState } from "react";
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
  added?: string;
  removed?: string;
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
  const [announcement, setAnnouncement] = useState("");
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const chosenListRef = useRef<HTMLUListElement>(null);
  const pendingFocusRef = useRef<{ type: "input" } | { type: "chosen"; index: number } | null>(null);
  const prevTagsRef = useRef<string[]>(initial);
  const full = tags.length >= PAL_PLUS_LIMITS.tags;
  const en = copy.remove.toLowerCase().includes("remove");
  const fullMessage = copy.full.replace("{max}", String(PAL_PLUS_LIMITS.tags));
  const same = (a: string, b: string) => a.toLocaleLowerCase("nl-BE") === b.toLocaleLowerCase("nl-BE");
  const has = (tag: string) => tags.some((other) => same(other, tag));

  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (pending) {
      pendingFocusRef.current = null;
      if (pending.type === "input") {
        inputRef.current?.focus();
      } else {
        const buttons = chosenListRef.current?.querySelectorAll<HTMLButtonElement>("button");
        if (buttons && buttons.length > 0) {
          buttons[Math.min(pending.index, buttons.length - 1)]?.focus();
        } else {
          inputRef.current?.focus();
        }
      }
    }

    const prev = prevTagsRef.current;
    if (prev !== tags) {
      const added = tags.filter((tag) => !prev.includes(tag));
      const removed = prev.filter((tag) => !tags.includes(tag));
      prevTagsRef.current = tags;
      if (added.length > 0) {
        const lastAdded = added[added.length - 1]!;
        const addedMsg = (copy.added ?? (en ? "Added tag {tag}." : "Tag {tag} toegevoegd.")).replace(
          "{tag}",
          lastAdded,
        );
        setAnnouncement(tags.length >= PAL_PLUS_LIMITS.tags ? `${addedMsg} ${fullMessage}` : addedMsg);
      } else if (removed.length > 0) {
        const lastRemoved = removed[removed.length - 1]!;
        setAnnouncement(
          (copy.removed ?? (en ? "Removed tag {tag}." : "Tag {tag} weggehaald.")).replace("{tag}", lastRemoved),
        );
      }
    }
  }, [tags, copy.added, copy.removed, en, fullMessage]);

  function add(raw: string) {
    const tag = raw.replace(/\s+/g, " ").trim().slice(0, PAL_PLUS_LIMITS.tag);
    setDraft("");
    if (!tag || has(tag)) return;
    if (tags.length >= PAL_PLUS_LIMITS.tags) {
      setAnnouncement(fullMessage);
      return;
    }
    // Dezelfde schrijfwijze als een snelle tag of een voorstel, als die er is.
    const known = [...presets, ...suggestions].find((other) => same(other, tag));
    setTags((prev) => (prev.length >= PAL_PLUS_LIMITS.tags ? prev : [...prev, known ?? tag]));
  }

  const remove = (tag: string) => setTags((prev) => prev.filter((other) => !same(other, tag)));
  const toggle = (tag: string) => (has(tag) ? remove(tag) : add(tag));
  const chosenTags = tags.filter((tag) => !presets.includes(tag));
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

      {chosenTags.length > 0 && (
        <ul ref={chosenListRef} className="pp-tags-chosen">
          {chosenTags.map((tag, index) => (
            <li key={tag}>
              {tag}
              <button
                type="button"
                onClick={() => {
                  pendingFocusRef.current = { type: "chosen", index };
                  remove(tag);
                }}
                aria-label={`${copy.remove}: ${tag}`}
                title={copy.remove}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <Input
        ref={inputRef}
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
            if (full) setAnnouncement(fullMessage);
            else add(draft);
          } else if (event.key === "Backspace" && !draft && tags.length > 0) {
            remove(tags[tags.length - 1]);
          }
        }}
        onBlur={() => draft && add(draft)}
        maxLength={PAL_PLUS_LIMITS.tag}
        placeholder={full ? fullMessage : copy.placeholder}
        readOnly={full}
        aria-disabled={full || undefined}
        autoComplete="off"
        aria-describedby={`${id}-help`}
      />

      {openSuggestions.length > 0 && !full && (
        <div className="pp-tags-suggest">
          {openSuggestions.slice(0, 8).map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => {
                pendingFocusRef.current = { type: "input" };
                add(tag);
              }}
            >
              + {tag}
            </button>
          ))}
        </div>
      )}
      <p id={`${id}-help`} className="pp-tags-help">
        {copy.help}
      </p>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </div>
  );
}
