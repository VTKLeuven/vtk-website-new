/**
 * De kaft van een Bakske of Ir.Reëel: bladzijde 1 van de pdf als JPEG.
 *
 * Dit gebeurt in de browser van wie de editie uploadt (in /admin/media), niet op
 * de server en niet bij de lezer. De server heeft geen pdf-renderer (sharp is
 * zonder pdf-ondersteuning gebouwd), en pdf.js op de homepage zou elke bezoeker
 * een megabyte script en een stuk pdf laten laden voor één tegel in het nieuws.
 * Zo gebeurt het één keer, en is de kaft daarna een gewone foto.
 */

/** Breedte van de kaft: ruim voor een tegel van 16:9 op een scherm met dubbele dichtheid. */
const COVER_WIDTH = 900;

export async function renderPdfCover(source: File | string): Promise<Blob> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const task = pdfjs.getDocument(
    typeof source === "string"
      ? { url: source, disableAutoFetch: true, rangeChunkSize: 262144 }
      : { data: new Uint8Array(await source.arrayBuffer()) },
  );
  const pdf = await task.promise;
  try {
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: COVER_WIDTH / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas is unavailable");
    // Een pdf zonder achtergrond is transparant; zonder wit vlak wordt dat zwart in een JPEG.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No cover"))), "image/jpeg", 0.86),
    );
  } finally {
    await pdf.destroy();
  }
}
