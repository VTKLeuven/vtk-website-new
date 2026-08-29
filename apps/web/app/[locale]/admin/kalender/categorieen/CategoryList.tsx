"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import type { Locale } from "@vtk/i18n";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import {
  deleteCalendarCategoryAction,
  reorderCalendarCategoriesAction,
} from "@/app/actions/calendar";
import { CategoryForm, type CategoryRow } from "./CategoryForm";

export function CategoryList({
  categories,
  locale,
  kind,
  emptyLabel,
}: {
  categories: CategoryRow[];
  locale: Locale;
  kind: "category" | "audience";
  emptyLabel: string;
}) {
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const [prevCategories, setPrevCategories] = useState(categories);
  const [items, setItems] = useState<CategoryRow[]>(categories);
  const [, startTransition] = useTransition();

  if (categories !== prevCategories) {
    setPrevCategories(categories);
    setItems(categories);
  }

  const dragFrom = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function onDrop(to: number) {
    const from = dragFrom.current;
    dragFrom.current = null;
    setOverIndex(null);
    if (from === null || from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setItems(next);
    startTransition(() => void reorderCalendarCategoriesAction(next.map((c) => c.id)));
  }

  if (items.length === 0) {
    return <p className="text-sm text-vtk-blue-muted p-5">{emptyLabel}</p>;
  }

  return (
    <div className="divide-y divide-vtk-blue/10 p-5">
      {items.map((c, index) => (
        <div
          key={c.id}
          className={`space-y-2 py-4 first:pt-0 last:pb-0 rounded-xl transition-colors ${
            overIndex === index ? "bg-vtk-yellow/20" : ""
          }`}
          draggable
          onDragStart={() => {
            dragFrom.current = index;
          }}
          onDragEnd={() => {
            dragFrom.current = null;
            setOverIndex(null);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (overIndex !== index) setOverIndex(index);
          }}
          onDrop={(e) => {
            e.preventDefault();
            onDrop(index);
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span
                className="cursor-grab active:cursor-grabbing text-zinc-400 hover:text-zinc-700 px-1 text-base select-none"
                title={nl ? "Sleep om volgorde te wijzigen" : "Drag to reorder"}
                aria-hidden="true"
              >
                ⠿
              </span>
              <span
                aria-hidden
                className="inline-block size-3 rounded-full"
                style={{ background: c.colour }}
              />
              <Link href={`${base}/kalender/${c.slug}`} className="font-medium hover:underline">
                {nl ? c.nameNl : c.nameEn}
              </Link>
              <span className="text-vtk-blue-muted">
                {c.eventCount} {nl ? "evenementen" : "events"}
              </span>
              <a
                href={`/api/calendar/feed/c/${c.slug}`}
                className="text-vtk-blue-muted hover:underline"
              >
                feed
              </a>
            </div>
            <DeleteIconButton
              label={nl ? "Verwijderen" : "Delete"}
              srLabel={`${nl ? "Verwijderen" : "Delete"}: ${nl ? c.nameNl : c.nameEn}`}
              action={deleteCalendarCategoryAction}
              fields={{ id: c.id }}
              title={nl ? "Categorie verwijderen?" : "Delete category?"}
              description={
                nl
                  ? `De categorie "${c.nameNl}" verdwijnt, samen met haar kalenderpagina /kalender/${c.slug} en haar agenda-feed; wie daarop geabonneerd is, krijgt geen updates meer. De ${c.eventCount} evenementen zelf blijven bestaan en blijven op /kalender staan, ze verliezen enkel deze categorie.`
                  : `The category "${c.nameEn}" disappears, along with its calendar page /kalender/${c.slug} and its calendar feed; anyone subscribed to it stops receiving updates. The ${c.eventCount} events themselves remain and stay on /kalender, they only lose this category.`
              }
              confirmLabel={nl ? "Verwijderen" : "Delete"}
              cancelLabel={nl ? "Annuleren" : "Cancel"}
              successMessage={nl ? "Categorie verwijderd" : "Category deleted"}
            />
          </div>
          <CategoryForm
            category={c}
            locale={locale}
            kind={kind}
          />
        </div>
      ))}
    </div>
  );
}
