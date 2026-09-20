import { addDriverFromGroupAction } from '@/app/actions/beheer';
import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { LogisticsIcon } from '@/components/logistics-icon';
import type { GroupDrivers } from '@/lib/uitleen-server';

/**
 * Wie er per post en werkgroep chauffeur is (F4.10).
 *
 * Het andere eind van F4.9. Sinds die ronde is de keuzelijst bij een
 * doorgegeven rit de doorsnede van de post en de chauffeurslijst, en een post
 * waarvan niemand in die lijst staat, krijgt er geen. Wie dat leest terwijl de
 * rit er al ligt, weet nog altijd niet wie hij dan moet toevoegen, en dat is
 * precies wat hier staat: dezelfde doorsnede, per post, vóór er een rit aan
 * hangt.
 *
 * **Eén lijst en niet één per post.** De knop hieronder zet iemand in dezelfde
 * chauffeurslijst als de picker bovenaan; hij is daarna ook bij de andere posten
 * kiesbaar. Een chauffeur van Sport alleen bestaat niet, en dat staat er met
 * zoveel woorden bij: een knop onder een postnaam belooft anders iets kleiners
 * dan ze doet.
 */

function memberWord(count: number): string {
  return count === 1 ? 'lid' : 'leden';
}

function GroupRow({ group }: { group: GroupDrivers }) {
  const total = group.drivers.length + group.others.length;

  return (
    <li className="rounded-[14px] border border-vtk-navy/10 bg-vtk-paper/40 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="font-medium text-vtk-ink">{group.name}</p>
        {group.drivers.length === 0 ? (
          <span className="rounded-full bg-vtk-warn-soft px-2.5 py-0.5 text-xs font-semibold text-vtk-ink">
            nog geen chauffeur
          </span>
        ) : (
          <span className="text-xs text-vtk-muted">
            {group.drivers.length} van de {total} {memberWord(total)}
          </span>
        )}
      </div>

      <p className="mt-1 text-sm text-vtk-body">
        {group.drivers.length > 0 ? (
          group.drivers.map((driver) => driver.name).join(' · ')
        ) : (
          <span className="text-vtk-muted">
            Deze post kan zelf geen chauffeur aanduiden op een rit die je doorgeeft.
          </span>
        )}
      </p>

      {group.others.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-vtk-navy">
            Chauffeur toevoegen ({group.others.length} {memberWord(group.others.length)} nog niet)
          </summary>
          <ul className="mt-2 grid gap-1.5">
            {group.others.map((member) => (
              <li
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-vtk-surface px-3 py-1.5"
              >
                <span className="min-w-0 text-sm text-vtk-body">{member.name}</span>
                {/* Een icoonknop en geen tekst: dit is een rij-actie, en de
                    uitklapper erboven zegt al wat er gebeurt. De naam zit in de
                    tooltip, anders leest een screenreader tien keer dezelfde
                    zin. */}
                <ConfirmActionButton
                  label={`Chauffeur maken: ${member.name}`}
                  icon={<LogisticsIcon name="driver" className="h-4 w-4" />}
                  successMessage={`${member.name} staat nu in de chauffeurslijst.`}
                  action={addDriverFromGroupAction.bind(null, member.id)}
                  confirm={false}
                />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  );
}

function GroupSection({ title, groups, empty }: { title: string; groups: GroupDrivers[]; empty: string }) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-vtk-ink">
        {title} ({groups.length})
      </h3>
      {groups.length === 0 ? (
        <p className="mt-2 text-sm text-vtk-muted">{empty}</p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {groups.map((group) => (
            <GroupRow key={group.id} group={group} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function GroupDriverList({ groups }: { groups: GroupDrivers[] }) {
  const posts = groups.filter((group) => group.type === 'PRAESIDIUM');
  const workgroups = groups.filter((group) => group.type === 'WERKGROEP');
  // Het getal dat de reden van dit scherm is: zoveel posten kunnen vandaag geen
  // chauffeur aanduiden op een rit die ze krijgen.
  const withoutDriver = groups.filter((group) => group.drivers.length === 0).length;

  return (
    <div className="grid gap-5">
      {withoutDriver > 0 ? (
        <p className="rounded-[12px] border border-vtk-warn-line bg-vtk-warn-soft px-4 py-2.5 text-sm text-vtk-ink">
          Bij {withoutDriver} van de {groups.length} posten en werkgroepen staat nog niemand in de chauffeurslijst.
        </p>
      ) : null}

      <GroupSection title="Posten" groups={posts} empty="Geen enkele post heeft dit werkingsjaar al leden." />
      <GroupSection
        title="Werkgroepen"
        groups={workgroups}
        empty="Geen enkele werkgroep heeft dit werkingsjaar al leden."
      />
    </div>
  );
}
