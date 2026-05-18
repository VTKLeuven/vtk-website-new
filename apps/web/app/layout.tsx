import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif, Inter } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const vtkSans = Inter({
  variable: "--font-vtk-sans",
  subsets: ["latin"],
});
const vtkSerif = Instrument_Serif({
  variable: "--font-vtk-serif",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "VTK – Vlaamse Technische Kring",
  description:
    "De officiële website van VTK, de studentenvereniging van de faculteit ingenieurswetenschappers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="nl"
      className={`${geistSans.variable} ${geistMono.variable} ${vtkSans.variable} ${vtkSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-vtk-surface text-vtk-ink antialiased selection:bg-vtk-yellow/40 selection:text-vtk-ink">
        {children}
      </body>
    </html>
  );
}
