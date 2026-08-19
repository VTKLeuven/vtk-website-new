import { notFound } from "next/navigation";
import { Card } from "@vtk/ui";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { removeDownloadEmailAction, revokeDeviceAction } from "@/app/actions/urenloop-app";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { readReleaseManifest, formatBytes } from "@/lib/urenloopApp/release";
import { AddDownloadEmailForm } from "./AddDownloadEmailForm";

// Internal IT tooling, so the copy stays English like the rest of the IT tab.
export default async function AdminUrenloopApp({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();

  await requirePermission("urenloopApp.manage");

  const [emails, release, recentCodes, devices] = await Promise.all([
    prisma.urenloopDownloadEmail.findMany({
      orderBy: { createdAt: "desc" },
      include: { addedBy: { select: { name: true } } },
    }),
    readReleaseManifest(),
    prisma.urenloopDownloadCode.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { email: true, createdAt: true, usedAt: true, expiresAt: true, attempts: true },
    }),
    prisma.urenloopDeviceToken.findMany({
      orderBy: [{ revokedAt: "asc" }, { lastUsedAt: "desc" }],
      take: 50,
    }),
  ]);

  const dateFmt = new Intl.DateTimeFormat("nl-BE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Brussels",
  });
  const now = new Date();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">24UL App Download</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Who may download the 24urenloop desktop app. The repository is private, so this
          list is the only way in: an address here can request a one-time code by mail and
          download the app with it.
        </p>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Current release</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Written by the 24urenloop-new build on every push to main. Each build overwrites
            the previous one, so object storage holds exactly one version.
          </p>
        </div>
        <Card className="p-5">
          {release ? (
            <dl className="space-y-2 text-sm">
              <div className="flex gap-2">
                <dt className="w-28 text-zinc-500">Version</dt>
                <dd className="font-medium">{release.version}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-28 text-zinc-500">Built</dt>
                <dd>{release.builtAt ? dateFmt.format(new Date(release.builtAt)) : "unknown"}</dd>
              </div>
              {release.commit ? (
                <div className="flex gap-2">
                  <dt className="w-28 text-zinc-500">Commit</dt>
                  <dd className="font-mono text-xs">{release.commit.slice(0, 12)}</dd>
                </div>
              ) : null}
              <div className="flex gap-2">
                <dt className="w-28 text-zinc-500">Files</dt>
                <dd className="space-y-0.5">
                  {release.files.map((f) => (
                    <div key={f.name}>
                      {f.name} <span className="text-zinc-500">{formatBytes(f.bytes)}</span>
                    </div>
                  ))}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-zinc-500">
              No release uploaded yet, or object storage is unreachable. The download page
              still works as soon as a build lands.
            </p>
          )}
        </Card>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Allowed addresses</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Removing an address takes effect immediately: any code already mailed to it stops
            working, and a download session opened with it is refused on the next click.
          </p>
        </div>
        <Card className="p-5">
          <AddDownloadEmailForm />

          <div className="relative mt-6 overflow-x-auto">
            {emails.length === 0 ? (
              <p className="text-sm text-zinc-500">Nobody on the list yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-vtk-blue/10 text-left text-xs uppercase text-zinc-500">
                    <th className="py-2 pr-4 font-medium">Address</th>
                    <th className="py-2 pr-4 font-medium">Note</th>
                    <th className="py-2 pr-4 font-medium">Added</th>
                    <th className="py-2 pr-4 font-medium">By</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {emails.map((entry) => (
                    <tr key={entry.id} className="border-b border-vtk-blue/5">
                      <td className="py-2 pr-4 font-medium">{entry.email}</td>
                      <td className="py-2 pr-4 text-zinc-500">{entry.note ?? ""}</td>
                      <td className="py-2 pr-4 text-zinc-500">{dateFmt.format(entry.createdAt)}</td>
                      <td className="py-2 pr-4 text-zinc-500">{entry.addedBy?.name ?? ""}</td>
                      <td className="py-2 text-right">
                        <DeleteIconButton
                          action={removeDownloadEmailAction}
                          fields={{ id: entry.id }}
                          label="Remove"
                          srLabel={`Remove: ${entry.email}`}
                          title="Remove from the download list?"
                          description={`${entry.email} can no longer request a code or download the app. Any code already sent to this address stops working. Copies already installed keep working, and on Windows keep updating themselves.`}
                          confirmLabel="Remove"
                          cancelLabel="Cancel"
                          successMessage="Address removed."
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Paired computers</h2>
          <p className="mt-1 text-sm text-zinc-500">
            The Windows app updates itself, and an updater cannot type a code, so each
            computer pairs once and keeps a token. Revoking one stops its updates at the
            next check; the app keeps working and says it needs pairing again. Removing an
            address above revokes its computers along with it.
          </p>
        </div>
        <Card className="p-5">
          <div className="relative overflow-x-auto">
            {devices.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No computer has paired yet. Installed apps still work; they just do not
                update themselves until somebody pairs them.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-vtk-blue/10 text-left text-xs uppercase text-zinc-500">
                    <th className="py-2 pr-4 font-medium">Computer</th>
                    <th className="py-2 pr-4 font-medium">Address</th>
                    <th className="py-2 pr-4 font-medium">Version</th>
                    <th className="py-2 pr-4 font-medium">Last check</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {devices.map((device) => (
                    <tr key={device.id} className="border-b border-vtk-blue/5">
                      <td className="py-2 pr-4 font-medium">
                        {device.label}
                        {device.revokedAt ? (
                          <span className="ml-2 text-xs font-normal text-zinc-500">revoked</span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-4 text-zinc-500">{device.email}</td>
                      <td className="py-2 pr-4 text-zinc-500">{device.appVersion ?? ""}</td>
                      <td className="py-2 pr-4 text-zinc-500">
                        {device.lastUsedAt ? dateFmt.format(device.lastUsedAt) : "never"}
                      </td>
                      <td className="py-2 text-right">
                        {device.revokedAt ? null : (
                          <DeleteIconButton
                            action={revokeDeviceAction}
                            fields={{ id: device.id }}
                            label="Revoke"
                            srLabel={`Revoke: ${device.label}`}
                            title="Revoke this computer?"
                            description={`${device.label} stops receiving updates at its next check. The app itself keeps working and keeps all its data; somebody on that computer can pair it again with a new code.`}
                            confirmLabel="Revoke"
                            cancelLabel="Cancel"
                            successMessage="Computer revoked."
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Recent code requests</h2>
          <p className="mt-1 text-sm text-zinc-500">
            The last ten, so you can tell whether somebody asking for help actually received
            a code. The codes themselves are stored hashed and cannot be shown.
          </p>
        </div>
        <Card className="p-5">
          <div className="relative overflow-x-auto">
            {recentCodes.length === 0 ? (
              <p className="text-sm text-zinc-500">No requests yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-vtk-blue/10 text-left text-xs uppercase text-zinc-500">
                    <th className="py-2 pr-4 font-medium">Address</th>
                    <th className="py-2 pr-4 font-medium">Requested</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCodes.map((code, index) => (
                    <tr key={`${code.email}-${index}`} className="border-b border-vtk-blue/5">
                      <td className="py-2 pr-4">{code.email}</td>
                      <td className="py-2 pr-4 text-zinc-500">{dateFmt.format(code.createdAt)}</td>
                      <td className="py-2 pr-4 text-zinc-500">
                        {code.usedAt
                          ? `used ${dateFmt.format(code.usedAt)}`
                          : code.expiresAt <= now
                            ? "expired unused"
                            : `open, ${code.attempts} failed attempts`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}
