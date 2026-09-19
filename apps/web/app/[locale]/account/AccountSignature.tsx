'use client';

import { useState, useRef, useId } from 'react';
import { Button, Input, Label, Select } from '@vtk/ui';
import { CopyIcon, CheckIcon } from '@/components/ui/icons';
import { useToast } from '@/components/ui/toast';
import {
  generateSignatureHtml,
  generateSignaturePlainText,
  buildDefaultVtkEmail,
  DEFAULT_MAPS_URL,
} from '@/lib/signature';
import { saveSignatureProfileAction } from '@/app/actions/signature';
import { saveErrorMessages } from '@/lib/saveMessages';
import { signatureRolePresets } from '@/lib/signatureProfile';

export type UserMembershipInfo = {
  groupNameNl: string;
  groupNameEn: string;
  titleNl: string | null;
  titleEn: string | null;
  year: number;
  yearCode: string;
};

const STORAGE_KEY = 'vtk_signature_settings_v2';
const STORAGE_PHONE_KEY = 'vtk_signature_phone';

type StoredSignatureData = {
  fullName?: string;
  roleTitle?: string;
  emailAddress?: string;
  phoneDisplay?: string;
};

/**
 * Wat er nog in `localStorage` van de vorige opzet staat.
 *
 * De handtekening woont nu op het profiel, want de server moet ze kunnen lezen
 * om een uitgaande mail ermee te ondertekenen. Deze twee lezers blijven staan
 * zodat wie zijn gegevens ooit in deze browser invulde, ze niet opnieuw moet
 * intikken: ze vullen het formulier voor, en de eerste keer opslaan zet ze op
 * het profiel.
 */
function legacyField(key: keyof StoredSignatureData): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSignatureData;
    const value = parsed[key];
    return value ? value : null;
  } catch {
    return null;
  }
}

function legacyPhone(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(STORAGE_PHONE_KEY);
  } catch {
    return null;
  }
}

const T = {
  nl: {
    title: 'E-mailhandtekening',
    intro:
      'Genereer je officiële VTK-handtekening voor je e-mails (Gmail, Outlook, Apple Mail). Pas eventueel je functie of telefoonnummer aan en sla je gegevens op voor een volgend bezoek.',
    fullNameLabel: 'Volledige naam',
    rolePresetLabel: 'Kies een functie of rol',
    roleCustomOption: 'Aangepaste functie...',
    roleLabel: 'Functietitel in handtekening',
    rolePlaceholder: 'bv. VTK IT 26-27',
    emailLabel: 'VTK E-mailadres',
    phoneLabel: 'Telefoonnummer (GSM)',
    phonePlaceholder: '+32 470 12 34 56',
    previewTitle: 'Voorbeeldweergave',
    saveDetails: 'Gegevens opslaan',
    savedDetails: 'Opgeslagen!',
    saveSuccessToast: 'Handtekening opgeslagen op je profiel.',
    savingDetails: 'Opslaan…',
    saveErrorToast: 'Niet opgeslagen. Probeer het opnieuw.',
    resetDefaults: 'Standaard herstellen',
    resetToast: 'Standaardgegevens hersteld.',
    copySignature: 'Handtekening kopiëren',
    copiedSignature: 'Gekopieerd!',
    copyHtml: 'HTML-code kopiëren',
    copiedHtml: 'HTML gekopieerd!',
    copySuccessToast: 'Handtekening gekopieerd! Plak ze nu in de handtekeninginstellingen van Gmail.',
    copyHtmlSuccessToast: 'HTML-broncode gekopieerd naar het klembord.',
    copyErrorToast: 'Kopiëren mislukt. Selecteer de tekst handmatig.',
    howToTitle: 'Hoe instellen in Gmail?',
    howToStep1: 'Klik op "Handtekening kopiëren".',
    howToStep2: 'Open Gmail en ga rechtsboven naar Instellingen (tandwiel) → Alle instellingen bekijken.',
    howToStep3: 'Scrol naar "Handtekening", klik op "Nieuwe maken" (of kies een bestaande) en plak (Ctrl+V of Cmd+V).',
    howToStep4: 'Scrol omlaag en klik op "Wijzigingen opslaan".',
  },
  en: {
    title: 'Email signature',
    intro:
      'Generate your official VTK email signature for Gmail, Outlook, Apple Mail, etc. Adjust your function or phone number as needed and save your details for next time.',
    fullNameLabel: 'Full name',
    rolePresetLabel: 'Choose a function or role',
    roleCustomOption: 'Custom role...',
    roleLabel: 'Function title in signature',
    rolePlaceholder: 'e.g. VTK IT 26-27',
    emailLabel: 'VTK Email address',
    phoneLabel: 'Phone number (mobile)',
    phonePlaceholder: '+32 470 12 34 56',
    previewTitle: 'Live preview',
    saveDetails: 'Save details',
    savedDetails: 'Saved!',
    saveSuccessToast: 'Signature saved to your profile.',
    savingDetails: 'Saving…',
    saveErrorToast: 'Not saved. Please try again.',
    resetDefaults: 'Reset to defaults',
    resetToast: 'Default values restored.',
    copySignature: 'Copy signature',
    copiedSignature: 'Copied!',
    copyHtml: 'Copy HTML code',
    copiedHtml: 'HTML copied!',
    copySuccessToast: 'Signature copied! Paste it into Gmail signature settings.',
    copyHtmlSuccessToast: 'HTML source code copied to clipboard.',
    copyErrorToast: 'Copy failed. Select the text manually.',
    howToTitle: 'How to set up in Gmail?',
    howToStep1: 'Click "Copy signature".',
    howToStep2: 'Open Gmail and click Settings (gear icon) → See all settings in the top right.',
    howToStep3: 'Scroll down to "Signature", click "Create new" (or edit existing) and paste (Ctrl+V or Cmd+V).',
    howToStep4: 'Scroll to the bottom and click "Save Changes".',
  },
} as const;

export function AccountSignature({
  locale,
  user,
  memberships = [],
  currentYearCode,
  stored,
}: {
  locale: 'nl' | 'en';
  user: {
    name: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
  memberships?: UserMembershipInfo[];
  currentYearCode: string;
  /**
   * Wat er op het profiel staat. Leeg veld = afgeleid (zie
   * `lib/signatureProfile.ts`), en dat is ook wat de mails van de lesbezoeken en
   * de Theokot-verhuur onder een mail van dit lid zetten.
   */
  stored: {
    signatureName: string | null;
    signatureRoleTitle: string | null;
    signatureEmail: string | null;
    signaturePhone: string | null;
  };
}) {
  const t = T[locale];
  const selectId = useId();
  const showToast = useToast();
  const previewRef = useRef<HTMLDivElement | null>(null);

  // Standaardnaam berekenen
  const defaultFullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.name;

  // Standaard VTK mail
  const defaultEmail = buildDefaultVtkEmail(user.firstName, user.lastName, user.email);

  // Rolpresets uit de postlidmaatschappen. Staat in `lib/signatureProfile.ts`,
  // want de mails van de lesbezoeken en de Theokot-verhuur leiden dezelfde
  // functie af voor wie ze verstuurt; twee kopieen lopen uiteen.
  const rolePresets = signatureRolePresets(memberships, locale, currentYearCode);
  const fallbackRole = `VTK ${currentYearCode}`;
  const initialRole = rolePresets[0]?.value ?? fallbackRole;

  // Het profiel wint van de browser: dat is sinds deze handtekening ook onder de
  // uitgaande mails komt de enige bron die de server kan lezen. Wat er nog in
  // `localStorage` staat, blijft dienen als eenmalige overname voor wie zijn
  // gegevens ooit hier invulde; opslaan zet ze op het profiel.
  const [fullName, setFullName] = useState(
    () => stored.signatureName ?? legacyField('fullName') ?? defaultFullName,
  );

  const [roleTitle, setRoleTitle] = useState(
    () => stored.signatureRoleTitle ?? legacyField('roleTitle') ?? initialRole,
  );

  const [emailAddress, setEmailAddress] = useState(
    () => stored.signatureEmail ?? legacyField('emailAddress') ?? defaultEmail,
  );

  const [phoneDisplay, setPhoneDisplay] = useState(
    () => stored.signaturePhone ?? legacyField('phoneDisplay') ?? legacyPhone() ?? '',
  );

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedRich, setCopiedRich] = useState(false);
  const [copiedHtml, setCopiedHtml] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);

  // Tikken bewaart niets meer: de handtekening staat op het profiel en dat is
  // een bewuste opslaan-klik. Elke toetsaanslag naar de server sturen zou van
  // een handtekening een formulier maken dat zichzelf half invult.
  function handleFullNameChange(val: string) {
    setFullName(val);
  }

  function handleRoleTitleChange(val: string) {
    setRoleTitle(val);
  }

  function handleEmailChange(val: string) {
    setEmailAddress(val);
  }

  function handlePhoneChange(val: string) {
    setPhoneDisplay(val);
  }

  async function handleSaveDetails() {
    const formData = new FormData();
    formData.set('signatureName', fullName);
    formData.set('signatureRoleTitle', roleTitle);
    formData.set('signatureEmail', emailAddress);
    formData.set('signaturePhone', phoneDisplay);

    setSaving(true);
    const result = await saveSignatureProfileAction({ status: 'idle' }, formData);
    setSaving(false);

    if (result.status === 'error') {
      const messages = saveErrorMessages(locale);
      showToast({
        message: messages[result.code ?? ''] ?? t.saveErrorToast,
        variant: 'error',
        duration: 0,
      });
      return;
    }

    // De oude browseropslag is vanaf nu overbodig en mag niet blijven
    // rondslingeren: ze zou bij een volgende sessie het profiel overschrijven in
    // het formulier.
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_PHONE_KEY);
    } catch {
      // Negeer opslagfouten
    }

    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
    showToast({ message: t.saveSuccessToast, variant: 'success' });
  }

  // Terugzetten vult het formulier opnieuw met het afgeleide; opslaan maakt het
  // pas definitief. Zo is een misklik hier niet meteen je handtekening kwijt.
  function handleResetDefaults() {
    setFullName(defaultFullName);
    setRoleTitle(initialRole);
    setEmailAddress(defaultEmail);
    setPhoneDisplay('');
    showToast({ message: t.resetToast, variant: 'info' });
  }

  const signatureData = {
    fullName,
    roleTitle,
    emailAddress,
    phoneDisplay,
  };

  const signatureHtml = generateSignatureHtml(signatureData);
  const signaturePlain = generateSignaturePlainText(signatureData);

  async function handleCopySignature() {
    let success = false;

    // Methode 1: Moderne ClipboardItem API met text/html en text/plain
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      try {
        const htmlBlob = new Blob([signatureHtml], { type: 'text/html' });
        const textBlob = new Blob([signaturePlain], { type: 'text/plain' });
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': htmlBlob,
            'text/plain': textBlob,
          }),
        ]);
        success = true;
      } catch (err) {
        console.warn('ClipboardItem write failed, falling back to selection copy:', err);
      }
    }

    // Methode 2: DOM selectie en execCommand copy als fallback
    if (!success && previewRef.current) {
      try {
        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
          const range = document.createRange();
          range.selectNodeContents(previewRef.current);
          selection.addRange(range);
          success = document.execCommand('copy');
          selection.removeAllRanges();
        }
      } catch (err) {
        console.warn('DOM selection copy failed:', err);
      }
    }

    // Methode 3: writeText fallback
    if (!success && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(signatureHtml);
        success = true;
      } catch {
        success = false;
      }
    }

    if (success) {
      setCopiedRich(true);
      setTimeout(() => setCopiedRich(false), 2500);
      showToast({ message: t.copySuccessToast, variant: 'success' });
    } else {
      showToast({ message: t.copyErrorToast, variant: 'error' });
    }
  }

  async function handleCopyHtml() {
    try {
      await navigator.clipboard.writeText(signatureHtml);
      setCopiedHtml(true);
      setTimeout(() => setCopiedHtml(false), 2500);
      showToast({ message: t.copyHtmlSuccessToast, variant: 'success' });
    } catch {
      showToast({ message: t.copyErrorToast, variant: 'error' });
    }
  }

  const phoneClean = phoneDisplay.replace(/[^\d+]/g, '');

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-vtk-ink">{t.title}</h3>
        <p className="mt-1 text-sm text-[#5c667f]">{t.intro}</p>
      </div>

      {/* Formulieren om velden aan te passen */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="sig-fullname">{t.fullNameLabel}</Label>
          <Input
            id="sig-fullname"
            value={fullName}
            onChange={(e) => handleFullNameChange(e.target.value)}
            placeholder="Voornaam Achternaam"
          />
        </div>

        <div>
          <Label htmlFor="sig-email">{t.emailLabel}</Label>
          <Input
            id="sig-email"
            type="email"
            value={emailAddress}
            onChange={(e) => handleEmailChange(e.target.value)}
            placeholder="voornaam.achternaam@vtk.be"
          />
        </div>

        {rolePresets.length > 1 ? (
          <div>
            <Label htmlFor={`${selectId}-rolepreset`}>{t.rolePresetLabel}</Label>
            <Select
              id={`${selectId}-rolepreset`}
              value={rolePresets.some((p) => p.value === roleTitle) ? roleTitle : '__custom__'}
              onChange={(e) => {
                const val = e.target.value;
                if (val !== '__custom__') {
                  handleRoleTitleChange(val);
                }
              }}
            >
              {rolePresets.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
              <option value="__custom__">{t.roleCustomOption}</option>
            </Select>
          </div>
        ) : null}

        <div className={rolePresets.length > 1 ? '' : 'sm:col-span-1'}>
          <Label htmlFor="sig-role">{t.roleLabel}</Label>
          <Input
            id="sig-role"
            value={roleTitle}
            onChange={(e) => handleRoleTitleChange(e.target.value)}
            placeholder={t.rolePlaceholder}
          />
        </div>

        <div>
          <Label htmlFor="sig-phone">{t.phoneLabel}</Label>
          <Input
            id="sig-phone"
            value={phoneDisplay}
            onChange={(e) => handlePhoneChange(e.target.value)}
            placeholder={t.phonePlaceholder}
          />
        </div>
      </div>

      {/* Live Voorbeeld weergave */}
      <div>
        <Label className="mb-2 block">{t.previewTitle}</Label>
        <div className="rounded-xl border border-vtk-blue/15 bg-white p-5 shadow-xs overflow-x-auto">
          {/* De renderable table die exact de Twig styles repliceert */}
          <div ref={previewRef} className="inline-block min-w-max select-all">
            <table style={{ borderCollapse: 'collapse', color: '#1f2449' }}>
              <tbody>
                <tr>
                  <td
                    style={{
                      borderRight: 'solid 7px #eed610',
                      verticalAlign: 'top',
                      paddingTop: '0px',
                      paddingRight: '12px',
                    }}
                  >
                    <a href="https://www.vtk.be" target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        width="auto"
                        height={140}
                        style={{ height: '140px', width: 'auto', display: 'block' }}
                        src="/_site/img/schild_blauw.png"
                        alt="VTK Schild"
                      />
                    </a>
                  </td>
                  <td style={{ paddingTop: '6px', paddingLeft: '10px', verticalAlign: 'top' }}>
                    <table style={{ borderCollapse: 'collapse' }}>
                      <tbody>
                        <tr>
                          <td
                            colSpan={2}
                            style={{
                              paddingBottom: '0px',
                              textTransform: 'uppercase',
                              fontFamily: "'Droid Sans', Verdana, Arial, sans-serif",
                              fontSize: '12pt',
                              color: '#1f2449',
                              lineHeight: '1.2',
                            }}
                          >
                            <strong>{fullName.toUpperCase()}</strong>
                          </td>
                        </tr>
                        <tr>
                          <td
                            colSpan={2}
                            style={{
                              fontFamily: "'Century Gothic', Verdana, Arial, sans-serif",
                              fontSize: '9pt',
                              color: '#1f2449',
                              paddingTop: '2px',
                              paddingBottom: '2px',
                            }}
                          >
                            <strong>{roleTitle}</strong>
                          </td>
                        </tr>
                        <tr>
                          <td
                            colSpan={2}
                            style={{
                              fontFamily: "'Century Gothic', Verdana, Arial, sans-serif",
                              fontSize: '7pt',
                              color: '#1f2449',
                              paddingBottom: '2px',
                            }}
                          >
                            Vlaamse Technische Kring vzw | RPR Leuven
                          </td>
                        </tr>
                        <tr>
                          <td
                            colSpan={2}
                            style={{
                              fontFamily: "'Century Gothic', Verdana, Arial, sans-serif",
                              fontSize: '7pt',
                              color: '#1f2449',
                              paddingBottom: '2px',
                            }}
                          >
                            A:{' '}
                            <a
                              href={DEFAULT_MAPS_URL}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                textDecoration: 'none',
                                color: '#1f2449',
                                fontFamily: "'Century Gothic', Verdana, Arial, sans-serif",
                                fontSize: '7pt',
                              }}
                            >
                              Studentenwijk Arenberg 6/1, 3001 Heverlee
                            </a>
                          </td>
                        </tr>
                        <tr>
                          <td
                            colSpan={2}
                            style={{
                              fontFamily: "'Century Gothic', Verdana, Arial, sans-serif",
                              fontSize: '7pt',
                              color: '#1f2449',
                              paddingBottom: '2px',
                            }}
                          >
                            E:{' '}
                            <a
                              id="emailVTK"
                              href={`mailto:${emailAddress}`}
                              style={{
                                textTransform: 'lowercase',
                                textDecoration: 'none',
                                color: '#1f2449',
                                fontFamily: "'Century Gothic', Verdana, Arial, sans-serif",
                                fontSize: '7pt',
                              }}
                            >
                              {emailAddress.toLowerCase()}
                            </a>
                          </td>
                        </tr>
                        <tr>
                          <td
                            colSpan={2}
                            style={{
                              fontFamily: "'Century Gothic', Verdana, Arial, sans-serif",
                              fontSize: '7pt',
                              color: '#1f2449',
                              paddingBottom: '2px',
                            }}
                          >
                            M:{' '}
                            <a
                              id="phoneNumberVTK"
                              href={`tel:${phoneClean}`}
                              style={{
                                textDecoration: 'none',
                                color: '#1f2449',
                                fontFamily: "'Century Gothic', Verdana, Arial, sans-serif",
                                fontSize: '7pt',
                              }}
                            >
                              {phoneDisplay}
                            </a>
                          </td>
                        </tr>
                        <tr>
                          <td
                            colSpan={2}
                            style={{
                              fontFamily: "'Century Gothic', Verdana, Arial, sans-serif",
                              fontSize: '7pt',
                              color: '#1f2449',
                              paddingBottom: '2px',
                            }}
                          >
                            W:{' '}
                            <a
                              href="https://www.vtk.be"
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                textDecoration: 'none',
                                color: '#1f2449',
                                fontFamily: "'Century Gothic', Verdana, Arial, sans-serif",
                                fontSize: '7pt',
                              }}
                            >
                              www.vtk.be
                            </a>
                          </td>
                        </tr>
                        <tr>
                          <td
                            colSpan={2}
                            style={{
                              color: '#1f2449',
                              fontFamily: "'Century Gothic', Verdana, Arial, sans-serif",
                              fontSize: '7pt',
                              paddingBottom: '2px',
                            }}
                          >
                            VAT: BE0479482282
                          </td>
                        </tr>
                        <tr>
                          <td colSpan={2} id="socialMediaSpace" style={{ paddingTop: '2px' }} />
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Actieknoppen */}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={handleCopySignature} className="inline-flex items-center gap-2">
          {copiedRich ? <CheckIcon /> : <CopyIcon />}
          {copiedRich ? t.copiedSignature : t.copySignature}
        </Button>

        <Button
          type="button"
          variant="ghost"
          onClick={handleSaveDetails}
          disabled={saving}
          className="inline-flex items-center gap-2"
        >
          {savedSuccess ? <CheckIcon /> : null}
          {saving ? t.savingDetails : savedSuccess ? t.savedDetails : t.saveDetails}
        </Button>

        <Button type="button" variant="ghost" onClick={handleCopyHtml} className="inline-flex items-center gap-2">
          {copiedHtml ? <CheckIcon /> : <CopyIcon />}
          {copiedHtml ? t.copiedHtml : t.copyHtml}
        </Button>

        <Button type="button" variant="ghost" onClick={handleResetDefaults} className="text-xs text-[#5c667f] hover:text-vtk-ink">
          {t.resetDefaults}
        </Button>

        <button
          type="button"
          onClick={() => setShowHowTo((v) => !v)}
          className="text-xs text-vtk-blue hover:underline focus:outline-hidden"
        >
          {showHowTo ? (locale === 'nl' ? 'Instructies verbergen' : 'Hide instructions') : t.howToTitle}
        </button>
      </div>

      {/* Instructiehandleiding */}
      {showHowTo && (
        <div className="rounded-xl border border-vtk-blue/12 bg-vtk-blue-soft/30 p-4 text-sm text-[#34405e] space-y-2">
          <h4 className="font-semibold text-vtk-ink">{t.howToTitle}</h4>
          <ol className="list-decimal list-inside space-y-1 text-xs sm:text-sm text-[#475467]">
            <li>{t.howToStep1}</li>
            <li>{t.howToStep2}</li>
            <li>{t.howToStep3}</li>
            <li>{t.howToStep4}</li>
          </ol>
        </div>
      )}
    </div>
  );
}
