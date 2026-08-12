'use client';

import { useRef, useState } from 'react';

type Upload = { key: string; label?: string };
const mediaUrl = (key: string) => `/api/media/${key.split('/').map(encodeURIComponent).join('/')}`;

async function upload(file: File): Promise<Upload> {
  const form = new FormData();
  form.set('file', file);
  const response = await fetch('/api/uitleen/upload', { method: 'POST', body: form });
  if (!response.ok) throw new Error('upload_failed');
  return response.json() as Promise<Upload>;
}

/**
 * De foto's van één item, als één lijst.
 *
 * Er stonden hier twee uploadknoppen naast elkaar: één voor "de foto"
 * (`photoKey`) en één voor "extra foto's" (`photos`). Wie een eerste foto
 * uploadde moest dus raden in welk van de twee vakken ze hoorde, en wie de
 * verkeerde koos, kreeg geen beeld in de catalogus. Het onderscheid is er nog
 * wel in de database, maar het is hier geen keuze meer: de eerste foto is de
 * thumbnail, en met "Thumbnail maken" schuif je een andere naar voren.
 */
export function PhotosEditor({ initial }: { initial: Array<{ key: string }> }) {
  const [photos, setPhotos] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setError(null);
    try {
      const added = await Promise.all(Array.from(files).map(upload));
      setPhotos((current) => [...current, ...added.map(({ key }) => ({ key }))]);
    } catch { setError('Uploaden mislukt. Probeer opnieuw.'); }
    finally { setBusy(false); }
  }

  /** Naar voren schuiven in plaats van omwisselen: de volgorde van de rest blijft. */
  const makeCover = (key: string) =>
    setPhotos((all) => [...all.filter((photo) => photo.key === key), ...all.filter((photo) => photo.key !== key)]);

  return <div className="grid gap-2">
    {/* De eerste is de thumbnail, de rest is de galerij. */}
    <input type="hidden" name="photoKey" value={photos[0]?.key ?? ''} />
    <input type="hidden" name="photos" value={JSON.stringify(photos.slice(1))} />
    <div className="flex flex-wrap gap-2">
      {photos.map((photo, index) => (
        <figure key={photo.key} className={`relative h-24 w-24 overflow-hidden rounded-lg border bg-vtk-paper-2 ${index === 0 ? 'border-vtk-yellow' : 'border-vtk-navy/15'}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrl(photo.key)} alt={`Foto ${index + 1}`} className="h-full w-full object-cover" />
          <button type="button" onClick={() => setPhotos((all) => all.filter((p) => p.key !== photo.key))} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-vtk-ink/80 text-white" aria-label={`Foto ${index + 1} verwijderen`}>×</button>
          {index === 0 ? (
            <figcaption className="absolute inset-x-0 bottom-0 bg-vtk-yellow py-0.5 text-center text-[10px] font-semibold text-vtk-ink">Thumbnail</figcaption>
          ) : (
            // Altijd zichtbaar en niet enkel bij hoveren: op een tablet in de
            // loods bestaat hoveren niet.
            <button type="button" onClick={() => makeCover(photo.key)} className="absolute inset-x-0 bottom-0 bg-vtk-ink/75 py-0.5 text-center text-[10px] font-semibold text-white transition hover:bg-vtk-ink">
              Thumbnail maken
            </button>
          )}
        </figure>
      ))}
      <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="h-24 rounded-lg border border-dashed border-vtk-navy/30 px-3 text-xs font-medium text-vtk-ink hover:border-vtk-navy/60 disabled:opacity-50">
        {busy ? 'Uploaden…' : '+ Foto’s'}
      </button>
    </div>
    <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
    <p className="text-xs font-normal text-vtk-muted">De eerste foto is de thumbnail in de catalogus; de rest staat op de detailpagina.</p>
    {error ? <p className="text-xs text-red-700">{error}</p> : null}
  </div>;
}

type Property = { label: string; value: string };
export function PropertiesEditor({ initial }: { initial: Property[] }) {
  const [rows, setRows] = useState<Property[]>(initial.length ? initial : [{ label: '', value: '' }]);
  const update = (index: number, change: Partial<Property>) => setRows((all) => all.map((row, i) => i === index ? { ...row, ...change } : row));
  return <div className="grid gap-2">
    <input type="hidden" name="properties" value={JSON.stringify(rows.filter((row) => row.label.trim() && row.value.trim()))} />
    {rows.map((row, index) => <div key={index} className="flex gap-2">
      <input value={row.label} onChange={(e) => update(index, { label: e.target.value })} placeholder="Bv. Afmetingen" className="h-10 min-w-0 flex-1 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm" />
      <input value={row.value} onChange={(e) => update(index, { value: e.target.value })} placeholder="Bv. 40 × 30 cm" className="h-10 min-w-0 flex-[2] rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm" />
      <button type="button" onClick={() => setRows((all) => all.filter((_, i) => i !== index))} className="h-10 w-10 rounded-full border border-vtk-navy/15 text-vtk-muted" aria-label="Eigenschap verwijderen">×</button>
    </div>)}
    <button type="button" onClick={() => setRows((all) => [...all, { label: '', value: '' }])} className="justify-self-start text-sm font-semibold text-vtk-navy">+ Eigenschap</button>
  </div>;
}

type Download = { key: string; label: string };
export function DownloadsEditor({ initial }: { initial: Download[] }) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  async function add(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try { const result = await upload(file); setRows((all) => [...all, { key: result.key, label: file.name.replace(/\.pdf$/i, '') }]); }
    finally { setBusy(false); }
  }
  return <div className="grid gap-2">
    <input type="hidden" name="downloads" value={JSON.stringify(rows.filter((row) => row.key && row.label.trim()))} />
    {rows.map((row, index) => <div key={row.key} className="flex gap-2">
      <input value={row.label} onChange={(e) => setRows((all) => all.map((entry, i) => i === index ? { ...entry, label: e.target.value } : entry))} className="h-10 min-w-0 flex-1 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm" aria-label="Naam download" />
      <button type="button" onClick={() => setRows((all) => all.filter((_, i) => i !== index))} className="h-10 rounded-full border border-vtk-navy/15 px-3 text-sm text-vtk-muted">Verwijderen</button>
    </div>)}
    <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="justify-self-start rounded-full border border-vtk-navy/15 px-3 py-1.5 text-sm font-semibold text-vtk-ink">{busy ? 'Uploaden…' : '+ Pdf toevoegen'}</button>
    <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { add(e.target.files?.[0]); e.target.value = ''; }} />
  </div>;
}
