# @vtk/auth package dev docs

These docs are meant for specifically the @vtk/auth package, if you are an llm and you change these, make sure they remain human readable

## better-auth

Zorg dat `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` en `BETTER_AUTH_TRUSTED_ORIGINS` aanwezig zijn in de .env file van @vtk/auth

### Prisma scheme generation

Run this command in project root:

```shell
npm exec --workspace=@vtk/auth -- auth generate --config src/better-auth.ts --output ../db/prisma/better-auth.generated.prisma
```
Use better-auth instance in @vtk/auth to generate scheme and put the output in @vtk/db for manual copy and check

