import type { SessionPayload } from "@vtk/auth";

/**
 * Wie mag de taken van welke post verdelen.
 *
 * `tasks.manage` mag elke post; `tasks.manageOwn` enkel de praesidiumposten
 * waar de kijker dit werkingsjaar zelf op zit (`session.groups` is al op het
 * huidige werkingsjaar gescoped). Geen harde "enkel de verantwoordelijke": of
 * dat recht bij elk lid of enkel bij de lead hoort, zegt de rolgrant van de post
 * (DEFAULT of LEADER), zie docs/permissions.md.
 */
export type TaskEditScope = { all: boolean; groupIds: ReadonlySet<string> };

export function taskEditScope(session: SessionPayload): TaskEditScope {
  const has = (code: string) => session.user.isSuperAdmin || session.permissions.includes(code);
  const all = has("tasks.manage");
  const own = !all && has("tasks.manageOwn");
  return {
    all,
    groupIds: new Set(own ? session.groups.filter((g) => g.type === "PRAESIDIUM").map((g) => g.id) : []),
  };
}

export function canEditTasksOf(scope: TaskEditScope, groupId: string): boolean {
  return scope.all || scope.groupIds.has(groupId);
}

export function canEditAnyTasks(scope: TaskEditScope): boolean {
  return scope.all || scope.groupIds.size > 0;
}
