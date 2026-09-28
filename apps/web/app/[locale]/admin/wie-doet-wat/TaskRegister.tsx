"use client";

import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { Input, Label, Select, Textarea } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteButton } from "@/components/ui/DeleteIconButton";
import { deleteTaskAction, saveTaskAction } from "@/app/actions/tasks";
import {
  buildRegister,
  countUnassigned,
  type RegisterMember,
  type RegisterPost,
  type RegisterSection,
  type RegisterTask,
} from "@/lib/tasks/register";
import { Avatar, Modal } from "../admin-table";

export type SaveLabels = {
  submitLabel: string;
  savingLabel: string;
  savedMessage: string;
  fallbackErrorMessage: string;
  errorMessages: Record<string, string>;
};

/**
 * Het register van /admin/wie-doet-wat: per post een blok met haar taken, wie
 * ze opneemt en de backup. Zoeken en filteren gebeuren hier, op de data die de
 * server meegaf; een klik op een rij opent de taak (bewerken als je die post mag
 * verdelen, anders enkel lezen).
 */
export function TaskRegister({
  posts,
  tasks,
  locale,
  yearLabel,
  previousYearLabel,
  editableYear,
  saveLabels,
}: {
  posts: RegisterPost[];
  tasks: RegisterTask[];
  locale: "nl" | "en";
  yearLabel: string;
  previousYearLabel: string;
  editableYear: boolean;
  saveLabels: SaveLabels;
}) {
  const nl = locale === "nl";
  const [query, setQuery] = useState("");
  const [postId, setPostId] = useState<string | null>(null);
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);

  const sections = useMemo(
    () => buildRegister(posts, tasks, { query: deferredQuery, postId, onlyUnassigned }, locale),
    [posts, tasks, deferredQuery, postId, onlyUnassigned, locale],
  );
  const postById = useMemo(() => new Map(posts.map((post) => [post.id, post])), [posts]);
  const memberById = useMemo(
    () => new Map(posts.flatMap((post) => post.members.map((member) => [member.membershipId, member] as const))),
    [posts],
  );
  const editablePosts = posts.filter((post) => post.canEdit);
  const filtering = deferredQuery.trim() !== "" || onlyUnassigned;
  const unassigned = countUnassigned(tasks, postId);
  // Na het verwijderen valt de taak uit de props, en daarmee sluit de modal.
  const openTask = openId ? (tasks.find((task) => task.id === openId) ?? null) : null;
  const openPost = openTask ? postById.get(openTask.groupId) : undefined;

  const ctx: RowContext = { nl, postById, memberById, previousYearLabel, onOpen: setOpenId };

  return (
    <div className="space-y-5">
      <label className="vtk-task-search">
        <SearchIcon />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            nl
              ? "Waarover heb je een vraag? Bijvoorbeeld zaal, badge, affiche, terugbetaling"
              : "What do you need? For example hall, badge, poster, reimbursement"
          }
          aria-label={nl ? "Zoek een taak, post of persoon" : "Search a task, post or person"}
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={nl ? "Post" : "Post"} className="flex flex-wrap gap-1.5">
          <FilterChip pressed={postId === null} onClick={() => setPostId(null)}>
            {nl ? "Alle posten" : "All posts"}
          </FilterChip>
          {posts.map((post) => (
            <FilterChip key={post.id} pressed={postId === post.id} onClick={() => setPostId(post.id)}>
              {post.name}
            </FilterChip>
          ))}
        </div>
        <FilterChip pressed={onlyUnassigned} onClick={() => setOnlyUnassigned((v) => !v)} warn>
          {nl ? `Zonder verantwoordelijke (${unassigned})` : `Without anyone (${unassigned})`}
        </FilterChip>
        {editablePosts.length > 0 && (
          <button
            type="button"
            className="vtk-tile-btn vtk-tile-btn-primary ml-auto"
            onClick={() =>
              setCreatingFor(postId && postById.get(postId)?.canEdit ? postId : editablePosts[0].id)
            }
          >
            {nl ? "Nieuwe taak" : "New task"}
          </button>
        )}
      </div>

      {!editableYear && (
        <p className="text-sm">
          {nl
            ? `Je bekijkt ${yearLabel}. Verdelen kan enkel in het huidige werkingsjaar.`
            : `You are viewing ${yearLabel}. Tasks can only be divided in the current working year.`}
        </p>
      )}

      {sections.length === 0 ? (
        <p className="vtk-task-empty">
          {deferredQuery.trim()
            ? nl
              ? `Geen taak gevonden voor "${deferredQuery.trim()}". Probeer een ander woord, of zoek op de naam van een post.`
              : `No task found for "${deferredQuery.trim()}". Try another word, or search for the name of a post.`
            : nl
              ? "Elke taak heeft iemand. Zet de filter uit om alles te zien."
              : "Every task has someone. Turn off the filter to see everything."}
        </p>
      ) : (
        sections.map((section) => (
          <PostSection
            key={section.post.id}
            section={section}
            filtering={filtering}
            yearLabel={yearLabel}
            onAdd={() => setCreatingFor(section.post.id)}
            ctx={ctx}
          />
        ))
      )}

      {openTask && openPost && (
        <Modal title={openTask.name} onClose={() => setOpenId(null)}>
          {openPost.canEdit ? (
            <TaskForm
              key={openTask.id}
              task={openTask}
              initialGroupId={openTask.groupId}
              posts={posts}
              editablePosts={editablePosts}
              yearLabel={yearLabel}
              previousYearLabel={previousYearLabel}
              saveLabels={saveLabels}
              onDone={() => setOpenId(null)}
              nl={nl}
            />
          ) : (
            <TaskDetail task={openTask} ctx={ctx} yearLabel={yearLabel} />
          )}
        </Modal>
      )}

      {creatingFor && (
        <Modal title={nl ? "Nieuwe taak" : "New task"} onClose={() => setCreatingFor(null)}>
          <TaskForm
            task={null}
            initialGroupId={creatingFor}
            posts={posts}
            editablePosts={editablePosts}
            yearLabel={yearLabel}
            previousYearLabel={previousYearLabel}
            saveLabels={saveLabels}
            onDone={() => setCreatingFor(null)}
            nl={nl}
          />
        </Modal>
      )}
    </div>
  );
}

type RowContext = {
  nl: boolean;
  postById: Map<string, RegisterPost>;
  memberById: Map<string, RegisterMember>;
  previousYearLabel: string;
  onOpen: (taskId: string) => void;
};

function PostSection({
  section,
  filtering,
  yearLabel,
  onAdd,
  ctx,
}: {
  section: RegisterSection;
  filtering: boolean;
  yearLabel: string;
  onAdd: () => void;
  ctx: RowContext;
}) {
  const { nl } = ctx;
  const { post, own, linked, unassigned, idle } = section;
  const headingId = `post-${post.id}`;
  const hasRows = own.length + linked.length > 0;

  return (
    <section className="vtk-task-post" aria-labelledby={headingId}>
      <header className="vtk-task-post-head">
        <div className="min-w-0">
          <h2 id={headingId}>{post.name}</h2>
          <p>
            {post.members.length === 0
              ? nl
                ? `Nog niemand op deze post in ${yearLabel}`
                : `No one on this post in ${yearLabel} yet`
              : post.members.map((m) => m.name).join(", ")}
          </p>
        </div>
        <div className="vtk-task-post-actions">
          {unassigned > 0 ? (
            <span className="vtk-task-status" data-tone="open">
              {nl ? `${unassigned} zonder verantwoordelijke` : `${unassigned} without anyone`}
            </span>
          ) : own.length > 0 && !filtering ? (
            <span className="vtk-task-status" data-tone="ok">
              {nl ? "Alles verdeeld" : "All divided"}
            </span>
          ) : null}
          {post.canEdit && (
            <button type="button" className="vtk-tile-btn" onClick={onAdd}>
              {nl ? "Taak toevoegen" : "Add task"}
            </button>
          )}
        </div>
      </header>

      {hasRows ? (
        <div className="vtk-task-table-wrap">
          <table className="vtk-task-table">
            <thead>
              <tr>
                <th scope="col">{nl ? "Waarvoor" : "What for"}</th>
                <th scope="col">{nl ? "Verantwoordelijk" : "Responsible"}</th>
                <th scope="col">{nl ? "Backup" : "Backup"}</th>
              </tr>
            </thead>
            <tbody>
              {own.map((task) => (
                <TaskRow key={task.id} task={task} ctx={ctx} />
              ))}
              {linked.length > 0 && (
                <tr className="vtk-task-sub">
                  <th scope="rowgroup" colSpan={3}>
                    {nl ? `Voor ${post.name}, bij een andere post` : `For ${post.name}, at another post`}
                  </th>
                </tr>
              )}
              {linked.map((task) => (
                <TaskRow key={task.id} task={task} ctx={ctx} fromOtherPost />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="vtk-task-none">
          {nl
            ? "Nog geen taken. Zet hier wat deze post doet, en wie je waarvoor aanspreekt."
            : "No tasks yet. List what this post does, and who to ask for what."}
        </p>
      )}

      {!filtering && own.length > 0 && idle.length > 0 && (
        <p className="vtk-task-idle">
          {nl ? `Nog zonder taak in ${yearLabel}: ` : `No task yet in ${yearLabel}: `}
          {idle.map((m) => m.name).join(", ")}
        </p>
      )}
    </section>
  );
}

function TaskRow({ task, ctx, fromOtherPost = false }: { task: RegisterTask; ctx: RowContext; fromOtherPost?: boolean }) {
  const { nl, postById, memberById, previousYearLabel, onOpen } = ctx;
  const holders = task.holders.map((id) => memberById.get(id)).filter((m): m is RegisterMember => Boolean(m));
  const backup = task.backup ? memberById.get(task.backup) : undefined;
  const owner = postById.get(task.groupId);
  const forPost = task.forGroupId ? postById.get(task.forGroupId) : undefined;

  return (
    <tr className="vtk-task-row" onClick={() => onOpen(task.id)}>
      <td data-label={nl ? "Waarvoor" : "What for"}>
        <button
          type="button"
          className="vtk-task-title"
          onClick={(e) => {
            e.stopPropagation();
            onOpen(task.id);
          }}
        >
          {task.name}
        </button>
        {fromOtherPost && owner && <span className="vtk-task-tag">{owner.name}</span>}
        {!fromOtherPost && forPost && (
          <span className="vtk-task-tag">{nl ? `voor ${forPost.name}` : `for ${forPost.name}`}</span>
        )}
        {task.description && <p className="vtk-task-desc">{task.description}</p>}
      </td>
      <td data-label={nl ? "Verantwoordelijk" : "Responsible"}>
        {holders.length > 0 ? (
          <People members={holders} />
        ) : (
          <>
            <span className="vtk-task-status" data-tone="open">
              {nl ? "Nog niemand" : "No one yet"}
            </span>
            {task.previous.length > 0 && (
              <p className="vtk-task-prev">
                {previousYearLabel}: {task.previous.join(", ")}
              </p>
            )}
          </>
        )}
      </td>
      <td data-label={nl ? "Backup" : "Backup"}>
        {backup ? <People members={[backup]} /> : <span className="vtk-task-nobackup">{nl ? "Geen" : "None"}</span>}
      </td>
    </tr>
  );
}

function People({ members }: { members: RegisterMember[] }) {
  return (
    <ul className="vtk-task-people">
      {members.map((m) => (
        <li key={m.membershipId}>
          <Avatar name={m.name} avatarUrl={m.avatarUrl} sm />
          <span>{m.name}</span>
        </li>
      ))}
    </ul>
  );
}

function TaskDetail({ task, ctx, yearLabel }: { task: RegisterTask; ctx: RowContext; yearLabel: string }) {
  const { nl, postById, memberById, previousYearLabel } = ctx;
  const holders = task.holders.map((id) => memberById.get(id)).filter((m): m is RegisterMember => Boolean(m));
  const backup = task.backup ? memberById.get(task.backup) : undefined;
  const forPost = task.forGroupId ? postById.get(task.forGroupId) : undefined;
  return (
    <dl className="vtk-task-detail">
      <dt>{nl ? "Post" : "Post"}</dt>
      <dd>
        {postById.get(task.groupId)?.name}
        {forPost ? (nl ? `, voor ${forPost.name}` : `, for ${forPost.name}`) : ""}
      </dd>
      {task.description && (
        <>
          <dt>{nl ? "Wat valt eronder" : "What it covers"}</dt>
          <dd className="whitespace-pre-line">{task.description}</dd>
        </>
      )}
      <dt>{nl ? `Verantwoordelijk in ${yearLabel}` : `Responsible in ${yearLabel}`}</dt>
      <dd>{holders.length > 0 ? <People members={holders} /> : nl ? "Nog niemand" : "No one yet"}</dd>
      <dt>{nl ? "Backup" : "Backup"}</dt>
      <dd>{backup ? <People members={[backup]} /> : nl ? "Geen" : "None"}</dd>
      {holders.length === 0 && task.previous.length > 0 && (
        <>
          <dt>{previousYearLabel}</dt>
          <dd>{task.previous.join(", ")}</dd>
        </>
      )}
    </dl>
  );
}

function TaskForm({
  task,
  initialGroupId,
  posts,
  editablePosts,
  yearLabel,
  previousYearLabel,
  saveLabels,
  onDone,
  nl,
}: {
  task: RegisterTask | null;
  initialGroupId: string;
  posts: RegisterPost[];
  editablePosts: RegisterPost[];
  yearLabel: string;
  previousYearLabel: string;
  saveLabels: SaveLabels;
  onDone: () => void;
  nl: boolean;
}) {
  const [groupId, setGroupId] = useState(initialGroupId);
  const [holders, setHolders] = useState<Set<string>>(() => new Set(task?.holders ?? []));
  const [backup, setBackup] = useState(task?.backup ?? "");
  const post = posts.find((p) => p.id === groupId);
  const members = post?.members ?? [];

  function toggleHolder(id: string) {
    setHolders((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // Wie de taak zelf opneemt, kan niet ook zijn eigen backup zijn.
    if (backup === id) setBackup("");
  }

  function changePost(id: string) {
    // De leden hangen aan de post; een keuze bij de vorige post is hier ongeldig.
    setGroupId(id);
    setHolders(new Set());
    setBackup("");
  }

  const holderNames = members.filter((m) => holders.has(m.membershipId)).map((m) => m.name);

  return (
    <div className="space-y-5">
      <SaveForm action={saveTaskAction} {...saveLabels} resetOnSuccess={false} onSuccess={onDone} className="space-y-4">
        {task && <input type="hidden" name="id" value={task.id} />}
        {task || editablePosts.length === 1 ? (
          <input type="hidden" name="groupId" value={groupId} />
        ) : (
          <div>
            <Label htmlFor="task-post">{nl ? "Post" : "Post"}</Label>
            <Select id="task-post" name="groupId" value={groupId} onChange={(e) => changePost(e.target.value)}>
              {editablePosts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div>
          <Label htmlFor="task-name">{nl ? "Waarvoor" : "What for"}</Label>
          <Input
            id="task-name"
            name="name"
            required
            maxLength={120}
            defaultValue={task?.name ?? ""}
            placeholder={nl ? "Bijvoorbeeld Verhuur van de zaal" : "For example Renting out the hall"}
          />
        </div>
        <div>
          <Label htmlFor="task-description">{nl ? "Wat valt eronder" : "What it covers"}</Label>
          <Textarea
            id="task-description"
            name="description"
            rows={2}
            maxLength={600}
            defaultValue={task?.description ?? ""}
            placeholder={
              nl
                ? "Aanvragen beantwoorden, contract, sleuteloverdracht en borg."
                : "Answering requests, contract, key handover and deposit."
            }
          />
        </div>
        <div>
          <Label htmlFor="task-keywords">{nl ? "Zoekwoorden" : "Search words"}</Label>
          <Input
            id="task-keywords"
            name="keywords"
            maxLength={300}
            defaultValue={task?.keywords ?? ""}
            placeholder={nl ? "huren, fuif, feestzaal" : "rent, party, venue"}
          />
          <p className="mt-1 text-xs">
            {nl
              ? "Woorden waarmee iemand zoekt die de naam van de taak niet kent. Ze staan nergens op het scherm."
              : "Words someone searches with who does not know the name of the task. They are not shown anywhere."}
          </p>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[#5c667f]">
            {nl ? `Verantwoordelijk in ${yearLabel}` : `Responsible in ${yearLabel}`}
          </legend>
          {members.length === 0 ? (
            <p className="text-sm">
              {nl
                ? `Nog niemand op ${post?.name ?? "deze post"} in ${yearLabel}. Voeg eerst leden toe bij Posten.`
                : `No one on ${post?.name ?? "this post"} in ${yearLabel} yet. Add members under Posts first.`}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {members.map((m) => (
                <label
                  key={m.membershipId}
                  className="inline-flex items-center gap-2 rounded-xl border border-vtk-blue/12 bg-vtk-blue-soft/30 px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    name="holders"
                    value={m.membershipId}
                    checked={holders.has(m.membershipId)}
                    onChange={() => toggleHolder(m.membershipId)}
                    className="shrink-0"
                  />
                  <span className="min-w-0 break-words">{m.name}</span>
                </label>
              ))}
            </div>
          )}
          {task && holders.size === 0 && task.previous.length > 0 && (
            <p className="mt-1.5 text-xs">
              {nl ? `In ${previousYearLabel} deed ` : `In ${previousYearLabel} this was done by `}
              {task.previous.join(", ")}
              {nl ? " dit." : "."}
            </p>
          )}
        </fieldset>

        {members.length > 0 && (
          <div>
            <Label htmlFor="task-backup">{nl ? "Backup" : "Backup"}</Label>
            <Select id="task-backup" name="backup" value={backup} onChange={(e) => setBackup(e.target.value)}>
              <option value="">{nl ? "Geen backup" : "No backup"}</option>
              {members
                .filter((m) => !holders.has(m.membershipId))
                .map((m) => (
                  <option key={m.membershipId} value={m.membershipId}>
                    {m.name}
                  </option>
                ))}
            </Select>
            <p className="mt-1 text-xs">
              {nl
                ? "Wie je aanspreekt als de verantwoordelijke niet antwoordt."
                : "Who to turn to when the responsible person does not answer."}
            </p>
          </div>
        )}

        <div>
          <Label htmlFor="task-for">{nl ? "Aanspreekpunt voor een andere post" : "Contact for another post"}</Label>
          <Select id="task-for" name="forGroupId" defaultValue={task?.forGroupId ?? ""}>
            <option value="">{nl ? "Nee" : "No"}</option>
            {posts
              .filter((p) => p.id !== groupId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </Select>
          <p className="mt-1 text-xs">
            {nl
              ? "Bijvoorbeeld \"IT-contact voor Theokot\": de taak staat dan ook bij die post in het register."
              : "For example \"IT contact for Theokot\": the task then also shows up under that post."}
          </p>
        </div>
      </SaveForm>

      {task && (
        <div className="border-t border-vtk-blue/10 pt-4">
          <DeleteButton
            action={deleteTaskAction}
            fields={{ id: task.id }}
            title={nl ? `"${task.name}" verwijderen?` : `Delete "${task.name}"?`}
            description={
              nl
                ? `De taak verdwijnt uit de takenlijst van ${post?.name ?? "de post"}, samen met wie ze in elk werkingsjaar opnam${
                    holderNames.length ? ` (in ${yearLabel}: ${holderNames.join(", ")})` : ""
                  }. De leden zelf blijven gewoon op de post.`
                : `The task disappears from the task list of ${post?.name ?? "the post"}, together with who took it on in every working year${
                    holderNames.length ? ` (in ${yearLabel}: ${holderNames.join(", ")})` : ""
                  }. The members themselves stay on the post.`
            }
            confirmLabel={nl ? "Verwijderen" : "Delete"}
            cancelLabel={nl ? "Annuleren" : "Cancel"}
            successMessage={nl ? "Taak verwijderd" : "Task deleted"}
            errorMessages={saveLabels.errorMessages}
            errorFallback={saveLabels.fallbackErrorMessage}
          >
            {nl ? "Taak verwijderen" : "Delete task"}
          </DeleteButton>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  pressed,
  onClick,
  warn = false,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  warn?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="vtk-task-chip"
      data-warn={warn ? "" : undefined}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
