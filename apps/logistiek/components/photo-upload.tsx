'use client';

import { useRef, useState } from 'react';

/**
 * Uploadt een foto naar /api/uitleen/upload en houdt de opgeslagen key in een
 * verborgen input, zodat ze meegaat met het omliggende <form> (SaveForm).
 */
export function PhotoUpload({ name, initialKey }: { name: string; initialKey: string | null }) {
  const [photoKey, setPhotoKey] = useState<string | null>(initialKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set('file', file);
      const res = await fetch('/api/uitleen/upload', { method: 'POST', body: form });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { key?: string };
      if (!data.key) throw new Error('no key');
      setPhotoKey(data.key);
    } catch {
      setError('Uploaden is niet gelukt. Probeer opnieuw.');
    } finally {
      setBusy(false);
    }
  }

  const preview = photoKey ? `/api/media/${photoKey.split('/').map(encodeURIComponent).join('/')}` : null;

  return (
    <div className="grid gap-2">
      <input type="hidden" name={name} value={photoKey ?? ''} />
      <div className="flex items-center gap-3">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-16 w-16 rounded-lg border border-vtk-navy/15 object-cover" />
        ) : (
          <div className="grid h-16 w-16 place-items-center rounded-lg border border-dashed border-vtk-navy/25 text-[10px] text-vtk-muted">
            geen foto
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="rounded-full border border-vtk-navy/15 px-3 py-1.5 text-sm font-semibold text-vtk-ink transition hover:border-vtk-navy/40 disabled:opacity-50"
          >
            {busy ? 'Uploaden...' : photoKey ? 'Vervangen' : 'Foto uploaden'}
          </button>
          {photoKey ? (
            <button
              type="button"
              onClick={() => setPhotoKey(null)}
              disabled={busy}
              className="rounded-full border border-vtk-navy/15 px-3 py-1.5 text-sm text-vtk-muted transition hover:border-vtk-navy/40"
            >
              Verwijderen
            </button>
          ) : null}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
          e.target.value = '';
        }}
      />
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
