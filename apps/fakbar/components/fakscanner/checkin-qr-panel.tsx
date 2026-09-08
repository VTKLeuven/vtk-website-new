'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { ElixirIcon } from '@/components/elixir-icon';

/**
 * De QR die naast de kaartlezer hangt.
 *
 * Wie hem scant met de VTK-app, checkt in zonder studentenkaart. De code is
 * ondertekend en verloopt niet, want hij hangt daar maanden; wat een gestolen
 * foto onbruikbaar maakt, zit niet in de code maar in de check-in zelf, die enkel
 * telt wanneer 't ElixIr op dat moment ook open gemeten wordt. Dat staat er ook
 * bij, zodat wie hem ophangt weet waarop hij vertrouwt.
 *
 * De QR wordt in de browser getekend uit de code die de server al maakte; hem
 * serverside maken zou een route en een cache vragen voor iets van een paar
 * kilobyte.
 */
export function CheckinQrPanel({ code }: { code: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(code, {
      width: 720,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#0A0F1F', light: '#FFFFFF' },
    })
      .then((value) => {
        if (active) setQr(value);
      })
      .catch(() => {
        if (active) setQr(null);
      });
    return () => {
      active = false;
    };
  }, [code]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2_000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <section className="fakbar-card space-y-4">
      <div>
        <h3 className="text-base font-semibold text-[var(--ink)]">Inchecken met de app</h3>
        <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-[var(--muted)]">
          Hang deze code naast de kaartlezer. Wie hem met de VTK-app scant, krijgt dezelfde
          check-in als met een studentenkaart.
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <div className="rounded-xl border border-[var(--line)] bg-white p-3">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- data-URI uit qrcode, geen remote asset
            <img src={qr} alt="QR-code om in te checken" className="h-44 w-44" width={176} height={176} />
          ) : (
            <div className="h-44 w-44 animate-pulse rounded bg-[var(--muted)]/20" />
          )}
        </div>

        <div className="min-w-[240px] flex-1 space-y-3">
          <p className="text-sm leading-relaxed text-[var(--body)]">
            Een check-in telt enkel wanneer &rsquo;t ElixIr op dat moment ook open gemeten wordt, en
            nog steeds maar één keer per bardag. Een foto van deze code doet dus niets op een avond
            dat de bar dicht is.
          </p>
          <p className="text-xs text-[var(--muted)]">
            Verandert het servergeheim, dan verandert deze code mee en moet de afdruk vervangen
            worden.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="fakbar-btn fakbar-btn-ghost"
              onClick={() => {
                void navigator.clipboard.writeText(code).then(() => setCopied(true));
              }}
            >
              <ElixirIcon name={copied ? 'check' : 'copy'} className="h-4 w-4" />
              {copied ? 'Gekopieerd' : 'Code kopiëren'}
            </button>
            {qr ? (
              <button type="button" className="fakbar-btn fakbar-btn-ghost" onClick={() => window.print()}>
                <ElixirIcon name="print" className="h-4 w-4" />
                Afdrukken
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
