import { getDictionary, type Locale } from "@vtk/i18n";

export async function Footer({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);

  return (
    <footer className="mt-20 border-t border-vtk-blue/10 bg-white">
      <div className="h-1 w-full bg-gradient-to-r from-vtk-blue via-vtk-blue-light to-vtk-yellow opacity-90" aria-hidden />
      <div className="border-t border-vtk-blue/8 bg-vtk-blue-soft/40 py-5 text-center text-xs">
        <p className="text-vtk-blue/55">
          © {new Date().getFullYear()} {dict.footer.copyright}
        </p>
      </div>
    </footer>
  );
}
