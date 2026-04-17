# @vtk/logistiek

First submodule scaffold, serving as the template for future modules that plug
into the main VTK site at `logistiek.vtk.be`.

## How it integrates

- Sessions are shared with the main site via the `.vtk.be` cookie domain.
- The session is verified remotely against `VTK_MAIN_URL/api/auth/session`
  using `@vtk/auth/remote`.
- Only users whose session includes the `Logistiek` group (or superadmins) can
  access the module.
- Deployed as a separate container behind Nginx on its own subdomain.

## Environment

- `VTK_MAIN_URL` – base URL of the main site (e.g. `https://vtk.be`).
- `SESSION_COOKIE_DOMAIN` – must match the main site (e.g. `.vtk.be`).

## Local development

```bash
npm run dev --workspace=@vtk/logistiek
```

Uses port 3100 so it can run next to the main app (port 3000).
