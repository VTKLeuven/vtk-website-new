import { describe, expect, it } from "vitest";
import { mailBodyToHtml, splitSignature } from "@/lib/mailBodyHtml";

const signature = {
  text: "JAN VAN DEN BROECK\nVTK Onderwijs 26-27\nE: jan@vtk.be",
  html: '<table class="sig"><tr><td>Jan</td></tr></table>',
};

const body = `Geachte professor,

Zou dit mogelijk zijn?

Met vriendelijke groet,
${signature.text}`;

describe("mailBodyToHtml", () => {
  it("zet de opgemaakte handtekening in de plaats van de platte", () => {
    const html = mailBodyToHtml(body, signature);
    expect(html).toContain(signature.html);
    expect(html).not.toContain("JAN VAN DEN BROECK");
  });

  it("houdt de tekst erboven, met haar witregels", () => {
    const html = mailBodyToHtml(body, signature);
    expect(html).toContain("Geachte professor,<br><br>Zou dit mogelijk zijn?");
    expect(html).toContain("Met vriendelijke groet,");
  });

  it("escapet wat de beheerder intikt", () => {
    const html = mailBodyToHtml(`Een <script>alert(1)</script> & co\n${signature.text}`, signature);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp; co");
    expect(html).not.toContain("<script>");
  });

  it("plakt niets bij wanneer de ondertekening weggehaald is", () => {
    const html = mailBodyToHtml("Kort berichtje zonder ondertekening.", signature);
    expect(html).not.toContain(signature.html);
    expect(html).toContain("Kort berichtje zonder ondertekening.");
  });

  it("laat een lege ondertekening de tekst ongemoeid", () => {
    const html = mailBodyToHtml("Dag professor", { text: "", html: "" });
    expect(html).toContain("Dag professor");
  });

  it("geeft een volledig document terug, zodat een mailclient het toont", () => {
    const html = mailBodyToHtml(body, signature);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("</html>");
  });
});

describe("de taal van de ondertekening", () => {
  // De sjablonen bestaan in twee talen en de functie verschilt mee. Wordt de
  // ondertekening in de verkeerde taal opgezocht, dan vindt `splitSignature`
  // niets terug en vertrekt een Engelse mail zonder de opgemaakte versie.
  const nl = { text: "JASPER\nVTK Onderwijs 26-27", html: "<table>nl</table>" };
  const en = { text: "JASPER\nVTK Education 26-27", html: "<table>en</table>" };
  const engelseMail = `Dear professor,\n\nKind regards,\n${en.text}`;

  it("vindt de handtekening niet met de verkeerde taal", () => {
    expect(splitSignature(engelseMail, nl).signatureHtml).toBeNull();
  });

  it("vindt ze wel met de juiste", () => {
    expect(splitSignature(engelseMail, en).signatureHtml).toBe(en.html);
  });
});
