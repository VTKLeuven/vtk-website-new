'use client';

/**
 * Vangt een fout in de root layout zelf op, waar `app/error.tsx` niet bij kan.
 * Eigen `<html>` en `<body>`, want de layout (en dus de stijl) is hier weg; de
 * kleuren volgen het systeem, net als het ingebouwde scherm van Next.
 */
import NextError from 'next/error';

export default function GlobalError() {
  return (
    <html lang="nl">
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
