import type { Metadata } from "next";
import { Geist, Geist_Mono, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const vtkSans = Space_Grotesk({
  variable: "--font-vtk-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});
const vtkMono = JetBrains_Mono({
  variable: "--font-vtk-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
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
      className={`${geistSans.variable} ${geistMono.variable} ${vtkSans.variable} ${vtkMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-vtk-surface text-vtk-blue antialiased selection:bg-vtk-yellow/40 selection:text-vtk-blue">
        {children}
      </body>
    </html>
  );
}
