import {
  archiveTicketTypeAction,
  createTicketTypeAction,
  updateInventoryPoolAction,
} from "@/app/actions/tickets";
import { Archive, Package, Plus, Save, Ticket, UsersRound } from "lucide-react";
import { formatMoney, type AdminLocale } from "./format";

type InventoryPool = {
  id: string;
  code: string;
  nameNl: string;
  nameEn: string | null;
  capacity: number;
  reservedCount: number;
  soldCount: number;
  active: boolean;
};

type TicketType = {
  id: string;
  code: string;
  nameNl: string;
  nameEn: string | null;
  unitPriceCents: number;
  currency: string;
  audience: string;
  minPerOrder: number;
  maxPerOrder: number;
  active: boolean;
  inventoryPool: InventoryPool;
  _count?: { orderItems: number };
};

export function TicketTypeManager({
  eventId,
  pools,
  ticketTypes,
  currency,
  locale,
}: {
  eventId: string;
  pools: InventoryPool[];
  ticketTypes: TicketType[];
  currency: string;
  locale: AdminLocale;
}) {
  const activePools = pools.filter((pool) => pool.active);

  return (
    <>
      <section className="ticket-admin-section">
        <div className="ticket-admin-section-head">
          <div className="ticket-admin-section-heading">
            <span className="ticket-admin-section-icon"><Package aria-hidden="true" size={17} /></span>
            <div>
            <h2>{locale === "nl" ? "Voorraad" : "Inventory"}</h2>
            <p>
              {locale === "nl"
                ? "Een voorraadpool kan door meerdere tickettypes worden gedeeld."
                : "An inventory pool can be shared by multiple ticket types."}
            </p>
            </div>
          </div>
        </div>
        {pools.length === 0 ? (
          <div className="ticket-admin-alert">
            {locale === "nl"
              ? "Er is nog geen voorraadpool. Maak het event opnieuw aan of laat een beheerder de initiële pool toevoegen."
              : "There is no inventory pool yet. Recreate the event or ask an administrator to add the initial pool."}
          </div>
        ) : (
          <ul className="ticket-admin-list">
            {pools.map((pool) => {
              const occupied = Math.min(pool.capacity, pool.soldCount + pool.reservedCount);
              const percentage = pool.capacity > 0 ? Math.round((occupied / pool.capacity) * 100) : 0;
              return (
                <li key={pool.id}>
                  <div className="ticket-admin-row-head">
                    <div>
                      <p className="ticket-admin-row-title">
                        {locale === "en" && pool.nameEn ? pool.nameEn : pool.nameNl}
                      </p>
                      <p className="ticket-admin-row-meta ticket-admin-code">{pool.code}</p>
                    </div>
                    <strong>
                      {pool.soldCount} / {pool.capacity}
                    </strong>
                  </div>
                  <div className="ticket-admin-progress" aria-label={`${percentage}%`}>
                    <span style={{ width: `${percentage}%` }} />
                  </div>
                  <p className="ticket-admin-row-meta">
                    {pool.reservedCount} {locale === "nl" ? "tijdelijk gereserveerd" : "temporarily reserved"}
                  </p>
                  <details className="ticket-admin-details">
                    <summary>{locale === "nl" ? "Capaciteit aanpassen" : "Edit capacity"}</summary>
                    <div className="ticket-admin-details-body">
                      <form action={updateInventoryPoolAction} className="ticket-admin-form">
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="eventId" value={eventId} />
                        <input type="hidden" name="poolId" value={pool.id} />
                        <div className="ticket-admin-form-grid">
                          <div className="ticket-admin-field">
                            <label htmlFor={`pool-name-nl-${pool.id}`}>Naam (NL)</label>
                            <input id={`pool-name-nl-${pool.id}`} name="nameNl" defaultValue={pool.nameNl} required />
                          </div>
                          <div className="ticket-admin-field">
                            <label htmlFor={`pool-name-en-${pool.id}`}>Naam (EN)</label>
                            <input id={`pool-name-en-${pool.id}`} name="nameEn" defaultValue={pool.nameEn ?? ""} />
                          </div>
                          <div className="ticket-admin-field">
                            <label htmlFor={`pool-capacity-${pool.id}`}>{locale === "nl" ? "Capaciteit" : "Capacity"}</label>
                            <input
                              id={`pool-capacity-${pool.id}`}
                              name="capacity"
                              type="number"
                              min={pool.soldCount + pool.reservedCount}
                              defaultValue={pool.capacity}
                              required
                            />
                          </div>
                        </div>
                        <label className="ticket-admin-check">
                          <input type="checkbox" name="active" value="true" defaultChecked={pool.active} />
                          <input type="hidden" name="active" value="false" />
                          {locale === "nl" ? "Pool actief" : "Pool active"}
                        </label>
                        <button className="ticket-admin-button" type="submit">
                          <Save aria-hidden="true" size={15} />
                          {locale === "nl" ? "Voorraad opslaan" : "Save inventory"}
                        </button>
                      </form>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="ticket-admin-section">
        <div className="ticket-admin-section-head">
          <div className="ticket-admin-section-heading">
            <span className="ticket-admin-section-icon"><Ticket aria-hidden="true" size={17} /></span>
            <div>
            <h2>{locale === "nl" ? "Tickettypes" : "Ticket types"}</h2>
            <p>
              {locale === "nl"
                ? "Prijzen worden in eurocent opgeslagen en kunnen na verkoop niet stilzwijgend worden aangepast."
                : "Prices are stored in cents and should not be changed silently after sales."}
            </p>
            </div>
          </div>
        </div>
        {ticketTypes.length === 0 ? (
          <p className="ticket-admin-empty">
            {locale === "nl" ? "Nog geen tickettypes." : "No ticket types yet."}
          </p>
        ) : (
          <ul className="ticket-admin-list">
            {ticketTypes.map((ticketType) => (
              <li key={ticketType.id}>
                <div className="ticket-admin-row-head">
                  <div>
                    <p className="ticket-admin-row-title">
                      {locale === "en" && ticketType.nameEn ? ticketType.nameEn : ticketType.nameNl}
                    </p>
                    <p className="ticket-admin-row-meta">
                      {formatMoney(ticketType.unitPriceCents, ticketType.currency, locale)} · {ticketType.inventoryPool.nameNl} · {ticketType.audience === "MEMBERS" ? (locale === "nl" ? "Leden" : "Members") : (locale === "nl" ? "Publiek" : "Public")}
                    </p>
                    <p className="ticket-admin-row-meta ticket-admin-inline-meta">
                      <UsersRound aria-hidden="true" size={13} />
                      {ticketType._count?.orderItems ?? 0} {locale === "nl" ? "bestelde tickets" : "ordered tickets"}
                      <span className="ticket-admin-code">{ticketType.code}</span>
                    </p>
                  </div>
                  {ticketType.active ? (
                    <form action={archiveTicketTypeAction}>
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="eventId" value={eventId} />
                      <input type="hidden" name="ticketTypeId" value={ticketType.id} />
                      <button className="ticket-admin-button" data-variant="danger" type="submit">
                        <Archive aria-hidden="true" size={15} />
                        {locale === "nl" ? "Archiveren" : "Archive"}
                      </button>
                    </form>
                  ) : (
                    <span className="ticket-admin-status" data-tone="neutral">
                      {locale === "nl" ? "Gearchiveerd" : "Archived"}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <hr className="ticket-admin-divider" />
        <details className="ticket-admin-details">
          <summary>{locale === "nl" ? "Tickettype toevoegen" : "Add ticket type"}</summary>
          <div className="ticket-admin-details-body">
            {activePools.length === 0 ? (
              <div className="ticket-admin-alert">
                {locale === "nl"
                  ? "Activeer eerst een voorraadpool."
                  : "Activate an inventory pool first."}
              </div>
            ) : (
              <form action={createTicketTypeAction} className="ticket-admin-form">
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="eventId" value={eventId} />
                <div className="ticket-admin-form-grid">
                  <div className="ticket-admin-field">
                    <label htmlFor="ticket-type-name-nl">Naam (NL)</label>
                    <input id="ticket-type-name-nl" name="nameNl" required />
                  </div>
                  <div className="ticket-admin-field">
                    <label htmlFor="ticket-type-name-en">Naam (EN)</label>
                    <input id="ticket-type-name-en" name="nameEn" />
                  </div>
                  <div className="ticket-admin-field">
                    <label htmlFor="ticket-type-code">Code</label>
                    <input id="ticket-type-code" name="code" placeholder="STANDARD" required />
                  </div>
                  <div className="ticket-admin-field">
                    <label htmlFor="ticket-type-pool">{locale === "nl" ? "Voorraadpool" : "Inventory pool"}</label>
                    <select id="ticket-type-pool" name="inventoryPoolId" defaultValue={activePools[0]?.id} required>
                      {activePools.map((pool) => (
                        <option key={pool.id} value={pool.id}>
                          {locale === "en" && pool.nameEn ? pool.nameEn : pool.nameNl}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="ticket-admin-field">
                    <label htmlFor="ticket-type-price">{locale === "nl" ? `Prijs in ${currency}` : `Price in ${currency}`}</label>
                    <input id="ticket-type-price" name="unitPrice" type="number" min="0" step="0.01" required />
                  </div>
                  <div className="ticket-admin-field">
                    <label htmlFor="ticket-type-audience">{locale === "nl" ? "Doelgroep" : "Audience"}</label>
                    <select id="ticket-type-audience" name="audience" defaultValue="PUBLIC">
                      <option value="PUBLIC">{locale === "nl" ? "Publiek" : "Public"}</option>
                      <option value="MEMBERS">{locale === "nl" ? "Alleen leden" : "Members only"}</option>
                    </select>
                  </div>
                  <div className="ticket-admin-field">
                    <label htmlFor="ticket-type-min">{locale === "nl" ? "Minimum per bestelling" : "Minimum per order"}</label>
                    <input id="ticket-type-min" name="minPerOrder" type="number" min="1" defaultValue="1" required />
                  </div>
                  <div className="ticket-admin-field">
                    <label htmlFor="ticket-type-max">{locale === "nl" ? "Maximum per bestelling" : "Maximum per order"}</label>
                    <input id="ticket-type-max" name="maxPerOrder" type="number" min="1" defaultValue="8" required />
                  </div>
                  <div className="ticket-admin-field">
                    <label htmlFor="ticket-type-sort">{locale === "nl" ? "Volgorde" : "Order"}</label>
                    <input id="ticket-type-sort" name="sortOrder" type="number" defaultValue="0" />
                  </div>
                  <div className="ticket-admin-field">
                    <label htmlFor="ticket-type-sales-start">{locale === "nl" ? "Verkoop start" : "Sales start"}</label>
                    <input id="ticket-type-sales-start" name="salesStartAt" type="datetime-local" />
                  </div>
                  <div className="ticket-admin-field">
                    <label htmlFor="ticket-type-sales-end">{locale === "nl" ? "Verkoop einde" : "Sales end"}</label>
                    <input id="ticket-type-sales-end" name="salesEndAt" type="datetime-local" />
                  </div>
                  <div className="ticket-admin-field" data-span="2">
                    <label htmlFor="ticket-type-description-nl">Beschrijving (NL)</label>
                    <textarea id="ticket-type-description-nl" name="descriptionNl" rows={2} />
                  </div>
                  <div className="ticket-admin-field" data-span="2">
                    <label htmlFor="ticket-type-description-en">Beschrijving (EN)</label>
                    <textarea id="ticket-type-description-en" name="descriptionEn" rows={2} />
                  </div>
                </div>
                <button className="ticket-admin-button" data-variant="primary" type="submit">
                  <Plus aria-hidden="true" size={16} />
                  {locale === "nl" ? "Tickettype toevoegen" : "Add ticket type"}
                </button>
              </form>
            )}
          </div>
        </details>
      </section>
    </>
  );
}
