import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VTK Logistiek",
  description: "Planning voor ritten en materiaal van de logistieke dienst.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className="h-full antialiased">
      <body className="min-h-full bg-vtk-surface text-vtk-blue antialiased selection:bg-vtk-yellow/40">
        {children}
      </body>
    </html>
  );
}
