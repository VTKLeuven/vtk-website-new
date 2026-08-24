import type { Metadata } from "next";
import BureauRegistrationRedirectPage from "../bureau-inschrijving/page";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default BureauRegistrationRedirectPage;
