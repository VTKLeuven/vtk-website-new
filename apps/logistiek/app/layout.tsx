import type { Metadata } from "next";
import { Instrument_Serif, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-vtk-sans", subsets: ["latin"] });
const serif = Instrument_Serif({
  variable: "--font-vtk-serif",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "VTK Logistiek",
  description: "Planning voor ritten en materiaal van de logistieke dienst.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={`${inter.variable} ${serif.variable} h-full antialiased`}>
      <body className="min-h-full bg-vtk-surface text-vtk-ink antialiased selection:bg-vtk-yellow/40 selection:text-vtk-ink">
        {children}
      </body>
    </html>
  );
}
