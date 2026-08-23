# VTK

De VTK-site als app, voor iOS en Android. Kalender, broodjes bestellen, tickets,
en alles wat er op vtk.be staat, in de vorm van een app.

Gebouwd met Expo (SDK 54) en expo-router. De inhoud komt van
[vtk-website-new](https://github.com/VTKLeuven/vtk-website-new) via
`/api/app/v1`.

```
npm install
npm start
```

Inloggen vraagt HTTPS, dus lokaal testen gaat tegen een cloudflared-tunnel naar
je eigen `npm run dev`; vul die URL in bij **Profiel -> Server**.

- `AGENTS.md` - de afspraken in deze repo
- `docs/plan.md` - het plan en hoever het staat
- `docs/architecture.md` - hoe de app met de site praat

De ticketscanner voor aan de deur is een aparte app: `vtk-scanner-app`.
