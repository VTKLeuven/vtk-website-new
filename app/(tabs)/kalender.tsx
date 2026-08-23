import { ComingSoon } from '../../src/components/ComingSoon';

export default function KalenderScreen() {
  return (
    <ComingSoon
      title="Kalender"
      subtitle="Alles wat er de komende weken te doen is"
      what="De agenda met de evenementen per categorie, met dezelfde doelgroepfilter als de site: een eerstejaarsevent hoort niet bij iedereen te staan."
      phase="fase 1"
      path="/kalender"
      linkLabel="Kalender op vtk.be"
    />
  );
}
