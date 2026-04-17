import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "VTK – Vlaamse Technische Kring",
  description:
    "De officiële website van VTK, de studentenvereniging voor industrieel ingenieurs en ingenieurswetenschappers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="nl"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-vtk-surface text-vtk-blue antialiased selection:bg-vtk-yellow/40 selection:text-vtk-blue">
        {children}
      </body>
    </html>
  );
}
