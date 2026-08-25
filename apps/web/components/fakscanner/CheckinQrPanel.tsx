"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, Printer } from "lucide-react";

import { IconButton } from "@/components/ui/IconButton";

/**
 * De QR die naast de kaartlezer hangt.
 *
 * Wie hem scant met de VTK-app, checkt in zonder studentenkaart. De code is
 * ondertekend en verloopt niet, want hij hangt daar maanden; wat een gestolen
 * foto onbruikbaar maakt, zit niet in de code maar in de check-in zelf, die enkel
 * telt wanneer 't ElixIr op dat moment ook open gemeten wordt. Dat staat er ook
 * bij, zodat wie hem ophangt weet waarop hij vertrouwt.
 *
 * De QR wordt in de browser getekend uit de code die er al staat; hem serverside
 * maken zou een route en een cache vragen voor iets van een paar kilobyte.
 * Zelfde aanpak als `SharePanel` bij de formulieren.
 */
export function CheckinQrPanel({ nl, code }: { nl: boolean; code: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(code, {
      width: 720,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#0A0F1F", light: "#FFFFFF" },
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
    <section className="space-y-3 rounded-2xl border border-vtk-blue/12 bg-white p-5">
      <div>
        <h2 className="text-sm font-semibold text-vtk-ink">
          {nl ? "Inchecken met de app" : "Check in with the app"}
        </h2>
        <p className="text-xs text-[#5c667f]">
          {nl
            ? "Hang deze code naast de kaartlezer. Wie hem met de VTK-app scant, krijgt dezelfde check-in als met een studentenkaart."
            : "Put this code next to the card reader. Scanning it with the VTK app gives the same check-in as a student card."}
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <div className="rounded-xl border border-vtk-blue/12 bg-white p-3">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- data-URI uit qrcode, geen remote asset
            <img
              src={qr}
              alt={nl ? "QR-code om in te checken" : "Check-in QR code"}
              className="h-44 w-44"
              width={176}
              height={176}
            />
          ) : (
            <div className="h-44 w-44 animate-pulse rounded bg-vtk-blue-soft" />
          )}
        </div>

        <div className="min-w-[240px] flex-1 space-y-3">
          <p className="text-sm text-[#34405e]">
            {nl
              ? "Een check-in telt enkel wanneer 't ElixIr op dat moment ook open gemeten wordt, en nog steeds maar één keer per bardag. Een foto van deze code doet dus niets op een avond dat de bar dicht is."
              : "A check-in only counts while 't ElixIr is measured as open, and still only once per bar day. A photo of this code does nothing on a night the bar is closed."}
          </p>
          <p className="text-xs text-[#5c667f]">
            {nl
              ? "Verandert het servergeheim, dan verandert deze code mee en moet de afdruk vervangen worden."
              : "If the server secret changes, this code changes with it and the printout must be replaced."}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <IconButton
              label={copied ? (nl ? "Gekopieerd" : "Copied") : nl ? "Code kopiëren" : "Copy code"}
              srLabel={nl ? "Code voor de fakscanner kopiëren" : "Copy the fakscanner code"}
              onClick={() => {
                void navigator.clipboard.writeText(code).then(() => setCopied(true));
              }}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </IconButton>
            {qr ? (
              <IconButton
                label={nl ? "Afdrukken" : "Print"}
                srLabel={nl ? "QR-code afdrukken" : "Print the QR code"}
                onClick={() => window.print()}
              >
                <Printer size={16} />
              </IconButton>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
