import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import type { Locale } from "@vtk/i18n";

import "@/app/design/vtk-basic.css";
import "@/app/design/vtk-home.css";
import "@/app/design/vtk-aanbod.css";
import "@/app/design/vtk-kalender.css";
import "@/app/design/vtk-event.css";
import "@/app/design/vtk-admin.css";

const swatches = [
  ["--ink", "var(--ink)"],
  ["--navy", "var(--navy)"],
  ["--yellow", "var(--yellow)"],
  ["--paper", "var(--paper)"],
  ["--paper-2", "var(--paper-2)"],
  ["--surface", "var(--surface)"],
  ["--muted", "var(--muted)"],
  ["--body", "var(--body)"],
];

const eventPills = [
  ["gala", "20:00", "Gala avond"],
  ["career", "14:00", "Jobfair"],
  ["service", "12:30", "Theokot"],
  ["more", "+3", "Meer events"],
];

export default async function SamplePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <div className="vtk-page-kicker">VTK / sample</div>
          <h1 className="vtk-page-title">
            {nl ? "Stijlgids" : "Style guide"} <em>{nl ? "voor bouwen" : "for building"}</em>
          </h1>
          <p className="vtk-page-subtitle">
            {nl
              ? "Een statische referentiepagina met de bestaande CSS-primitieven, Tailwind tokens en publieke componentpatronen."
              : "A static reference page with the existing CSS primitives, Tailwind tokens and public component patterns."}
          </p>
        </div>
        <div className="page-head-meta">
          <div>
            <b>Route</b>
          </div>
          <div>/{locale}/sample</div>
          <div>
            <b>Scope</b>
          </div>
          <div>apps/web</div>
        </div>
      </header>

      <main className="vtk-page-shell flex flex-col gap-16">
        <section className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <div className="label">
              <span className="vtk-dot" />
              Design tokens
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-vtk-ink">Color and type scale</h2>
            <p className="mt-3 max-w-prose text-sm leading-6 text-[#34405e]">
              Use CSS variables for site primitives and Tailwind theme utilities for component-level work.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {swatches.map(([name, value]) => (
              <div key={name} className="vtk-card p-4">
                <div
                  className="mb-4 h-20 rounded-xl border border-[var(--line)]"
                  style={{ background: value }}
                />
                <div className="font-mono text-xs text-vtk-ink">{name}</div>
                <div className="mt-1 text-xs text-[#5c667f]">{value}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <article className="vtk-card">
            <div className="tiny">Buttons</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Actions</h2>
            <div className="mt-6 flex flex-wrap gap-3">
              <a className="btn btn-primary arrow" href="#cards">
                Primary
              </a>
              <a className="btn btn-ghost" href="#cards">
                Ghost
              </a>
              <a className="btn btn-accent arrow" href="#cards">
                Accent
              </a>
            </div>
          </article>

          <article className="vtk-card">
            <div className="tiny">Spec list</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Meta data</h2>
            <dl className="spec mt-6">
              <dt>Status</dt>
              <dd>Published</dd>
              <dt>Owner</dt>
              <dd>VTK IT</dd>
              <dt>Pattern</dt>
              <dd>Public page</dd>
            </dl>
          </article>

          <article className="vtk-card">
            <div className="tiny">Placeholder</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Media frame</h2>
            <div className="ph mt-6 aspect-video">
              <span className="ph-label">.ph</span>
            </div>
          </article>
        </section>

        <section className="vtk-basic vtk-basic-section" id="basic">
          <div className="vtk-basic-head">
            <div>
              <div className="vtk-basic-kicker">vtk-basic.css</div>
              <h2 className="vtk-basic-title">Basic public building blocks</h2>
              <p className="vtk-basic-copy">
                Scoped, copyable elements for regular public pages. Wrap copied markup in <code>.vtk-basic</code> and
                import <code>@/app/design/vtk-basic.css</code> on the route that uses it.
              </p>
            </div>
            <a className="vtk-basic-button vtk-basic-button-primary" href="#basic-table">
              Jump to table
            </a>
          </div>

          <div className="vtk-basic-grid">
            <article className="vtk-basic-panel vtk-basic-stack">
              <div>
                <div className="vtk-basic-kicker">Buttons</div>
                <h3 className="text-2xl font-semibold tracking-tight">Actions</h3>
              </div>
              <div className="vtk-basic-row">
                <a className="vtk-basic-button vtk-basic-button-primary" href="#basic">
                  Primary
                </a>
                <a className="vtk-basic-button" href="#basic">
                  Default
                </a>
                <a className="vtk-basic-button vtk-basic-button-accent" href="#basic">
                  Accent
                </a>
                <button className="vtk-basic-button vtk-basic-button-danger" type="button">
                  Danger
                </button>
                <button className="vtk-basic-button" type="button" disabled>
                  Disabled
                </button>
              </div>
            </article>

            <article className="vtk-basic-panel vtk-basic-stack">
              <div>
                <div className="vtk-basic-kicker">Badges</div>
                <h3 className="text-2xl font-semibold tracking-tight">Status chips</h3>
              </div>
              <div className="vtk-basic-row">
                <span className="vtk-basic-badge">Default</span>
                <span className="vtk-basic-badge vtk-basic-badge-accent">Featured</span>
                <span className="vtk-basic-badge vtk-basic-badge-muted">Muted</span>
                <span className="vtk-basic-badge vtk-basic-badge-success">Open</span>
                <span className="vtk-basic-badge vtk-basic-badge-danger">Closed</span>
              </div>
            </article>

            <article className="vtk-basic-panel vtk-basic-panel-dark vtk-basic-stack">
              <div>
                <div className="vtk-basic-kicker">Dark panel</div>
                <h3 className="text-2xl font-semibold tracking-tight">Contrast surface</h3>
                <p className="vtk-basic-copy">
                  Use this for compact calls to action, not for long reading sections.
                </p>
              </div>
              <a className="vtk-basic-button vtk-basic-button-accent" href="#basic-form">
                Continue
              </a>
            </article>
          </div>

          <div className="vtk-basic-grid vtk-basic-grid-wide">
            <div className="vtk-basic-alert vtk-basic-alert-info">
              <span className="vtk-basic-alert-icon">i</span>
              <div>
                <h3 className="vtk-basic-alert-title">Info alert</h3>
                <p className="vtk-basic-alert-text">Use for neutral updates or contextual helper text.</p>
              </div>
            </div>
            <div className="vtk-basic-alert vtk-basic-alert-success">
              <span className="vtk-basic-alert-icon">✓</span>
              <div>
                <h3 className="vtk-basic-alert-title">Success alert</h3>
                <p className="vtk-basic-alert-text">Use after a completed action or a positive state.</p>
              </div>
            </div>
            <div className="vtk-basic-alert vtk-basic-alert-warning">
              <span className="vtk-basic-alert-icon">!</span>
              <div>
                <h3 className="vtk-basic-alert-title">Warning alert</h3>
                <p className="vtk-basic-alert-text">Use when a user should check something before continuing.</p>
              </div>
            </div>
            <div className="vtk-basic-alert vtk-basic-alert-danger">
              <span className="vtk-basic-alert-icon">!</span>
              <div>
                <h3 className="vtk-basic-alert-title">Danger alert</h3>
                <p className="vtk-basic-alert-text">Use for destructive or blocking states.</p>
              </div>
            </div>
          </div>

          <div className="vtk-basic-grid">
            <article className="vtk-basic-stat">
              <div className="vtk-basic-stat-label">Registrations</div>
              <div className="vtk-basic-stat-value">128</div>
              <div className="vtk-basic-stat-note">24 new this week</div>
            </article>
            <article className="vtk-basic-stat">
              <div className="vtk-basic-stat-label">Open shifts</div>
              <div className="vtk-basic-stat-value">16</div>
              <div className="vtk-basic-stat-note">Needs follow-up</div>
            </article>
            <article className="vtk-basic-stat">
              <div className="vtk-basic-stat-label">Completion</div>
              <div className="vtk-basic-stat-value">72%</div>
              <div className="vtk-basic-progress mt-2">
                <div className="vtk-basic-progress-track">
                  <div className="vtk-basic-progress-bar" style={{ width: "72%" }} />
                </div>
              </div>
            </article>
          </div>

          <div className="vtk-basic-grid vtk-basic-grid-wide">
            <article className="vtk-basic-panel vtk-basic-stack" id="basic-form">
              <div>
                <div className="vtk-basic-kicker">Form</div>
                <h3 className="text-2xl font-semibold tracking-tight">Inputs and controls</h3>
              </div>
              <form className="vtk-basic-stack">
                <label className="vtk-basic-field">
                  <span className="vtk-basic-label">Name</span>
                  <input className="vtk-basic-input" defaultValue="Sample activity" />
                  <span className="vtk-basic-help">Short labels work best in dense forms.</span>
                </label>
                <label className="vtk-basic-field">
                  <span className="vtk-basic-label">Type</span>
                  <select className="vtk-basic-select" defaultValue="service">
                    <option value="service">Service</option>
                    <option value="event">Event</option>
                    <option value="shift">Shift</option>
                  </select>
                </label>
                <label className="vtk-basic-field">
                  <span className="vtk-basic-label">Description</span>
                  <textarea className="vtk-basic-textarea" defaultValue="Reusable textarea styling for public forms." />
                </label>
                <label className="vtk-basic-check">
                  <input type="checkbox" defaultChecked />
                  Visible on public pages
                </label>
                <div className="vtk-basic-row">
                  <button className="vtk-basic-button vtk-basic-button-primary" type="button">
                    Save
                  </button>
                  <button className="vtk-basic-button" type="button">
                    Cancel
                  </button>
                </div>
              </form>
            </article>

            <article className="vtk-basic-panel vtk-basic-stack">
              <div>
                <div className="vtk-basic-kicker">Navigation</div>
                <h3 className="text-2xl font-semibold tracking-tight">Tabs and lists</h3>
              </div>
              <div className="vtk-basic-tabs" role="tablist" aria-label="Sample tabs">
                <button className="vtk-basic-tab vtk-basic-tab-active" type="button">
                  Overview
                </button>
                <button className="vtk-basic-tab" type="button">
                  Details
                </button>
                <button className="vtk-basic-tab" type="button">
                  Archive
                </button>
              </div>
              <ul className="vtk-basic-list">
                <li className="vtk-basic-list-item">
                  <span className="vtk-basic-list-mark" />
                  <div>
                    <div className="vtk-basic-list-title">List row title</div>
                    <div className="vtk-basic-list-meta">Secondary context stays compact.</div>
                  </div>
                  <span className="vtk-basic-badge vtk-basic-badge-success">Ready</span>
                </li>
                <li className="vtk-basic-list-item">
                  <span className="vtk-basic-list-mark" />
                  <div>
                    <div className="vtk-basic-list-title">Another row</div>
                    <div className="vtk-basic-list-meta">Works for links, tasks and schedules.</div>
                  </div>
                  <span className="vtk-basic-badge vtk-basic-badge-muted">Draft</span>
                </li>
              </ul>
            </article>
          </div>

          <div className="vtk-basic-grid vtk-basic-grid-wide">
            <article className="vtk-basic-panel vtk-basic-stack" id="basic-table">
              <div>
                <div className="vtk-basic-kicker">Public table</div>
                <h3 className="text-2xl font-semibold tracking-tight">Copy this for /shift</h3>
                <p className="vtk-basic-copy">
                  This table is not admin-scoped. It only needs the <code>.vtk-basic</code> wrapper and
                  <code> vtk-basic.css</code>.
                </p>
              </div>
              <div className="vtk-basic-table-wrap">
                <table className="vtk-basic-table">
                  <thead>
                    <tr>
                      <th>Shift</th>
                      <th>Time</th>
                      <th>Status</th>
                      <th>Owner</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Theokot morning</td>
                      <td>09:00-12:00</td>
                      <td>
                        <span className="vtk-basic-badge vtk-basic-badge-success">Open</span>
                      </td>
                      <td>VTK</td>
                    </tr>
                    <tr>
                      <td>Event setup</td>
                      <td>18:00-20:00</td>
                      <td>
                        <span className="vtk-basic-badge vtk-basic-badge-accent">Almost full</span>
                      </td>
                      <td>Cultuur</td>
                    </tr>
                    <tr>
                      <td>Cleanup</td>
                      <td>23:00-00:30</td>
                      <td>
                        <span className="vtk-basic-badge vtk-basic-badge-danger">Needs help</span>
                      </td>
                      <td>Bar team</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </article>

            <article className="vtk-basic-panel vtk-basic-stack">
              <div>
                <div className="vtk-basic-kicker">Timeline and empty state</div>
                <h3 className="text-2xl font-semibold tracking-tight">Supporting states</h3>
              </div>
              <ol className="vtk-basic-timeline">
                <li className="vtk-basic-timeline-item">
                  <div className="vtk-basic-list-title">Published</div>
                  <div className="vtk-basic-list-meta">Visible to students.</div>
                </li>
                <li className="vtk-basic-timeline-item">
                  <div className="vtk-basic-list-title">Reminder sent</div>
                  <div className="vtk-basic-list-meta">Email and calendar follow-up.</div>
                </li>
                <li className="vtk-basic-timeline-item">
                  <div className="vtk-basic-list-title">Archived</div>
                  <div className="vtk-basic-list-meta">Kept for later reference.</div>
                </li>
              </ol>
              <div className="vtk-basic-empty">
                <h3>No results</h3>
                <p>Use this when filters or an empty dataset leave a section without content.</p>
                <a className="vtk-basic-button vtk-basic-button-subtle" href="#basic">
                  Reset filters
                </a>
              </div>
            </article>
          </div>

          <nav className="vtk-basic-pagination" aria-label="Sample pagination">
            <a className="vtk-basic-page-link" href="#basic" aria-label="Previous page">
              &lt;
            </a>
            <a className="vtk-basic-page-link vtk-basic-page-link-active" href="#basic">
              1
            </a>
            <a className="vtk-basic-page-link" href="#basic">
              2
            </a>
            <a className="vtk-basic-page-link" href="#basic">
              3
            </a>
            <a className="vtk-basic-page-link" href="#basic" aria-label="Next page">
              &gt;
            </a>
          </nav>
        </section>

        <section id="cards" className="vtk-design">
          <div className="sec-head">
            <div>
              <div className="label">Home patterns</div>
              <h2>Cards, agenda and quick links</h2>
            </div>
            <div className="meta">Classes from vtk-home.css</div>
          </div>

          <div className="aanbod">
            <a className="acard feat" href="#calendar">
              <div>
                <div className="tag">Featured card</div>
                <h3>Highlighted surface</h3>
                <p>Dark feature card with yellow accents and the standard card spacing.</p>
              </div>
              <span className="cta">Read more</span>
            </a>
            <a className="acard" href="#calendar">
              <div>
                <div className="tag">Default card</div>
                <h3>Editorial content</h3>
                <p>White card, quiet border, compact copy and hover lift for repeated items.</p>
              </div>
              <span className="cta">Open section</span>
            </a>
            <a className="acard" href="#calendar">
              <div>
                <div className="tag">Service card</div>
                <h3>Student services</h3>
                <p>A practical card style for pages, tiles, services and dashboards.</p>
              </div>
              <span className="cta">Inspect</span>
            </a>
          </div>

          <div className="quick mt-8 px-0">
            <div className="quick-row">
              {["Kalender", "Aanbod", "Fotos", "Pocs", "Praesidium", "Contact"].map((item) => (
                <a key={item} className="ql" href="#calendar">
                  <span className="k">Quick link</span>
                  <span className="v">{item}</span>
                  <span className="m">Navigation pattern</span>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section id="calendar" className="vtk-design">
          <div className="page-head !px-0 !pt-0">
            <div>
              <div className="crumbs">Home / Kalender</div>
              <h1>
                Calendar <em>surface</em>
              </h1>
            </div>
            <div className="page-head-meta">
              <div>
                <b>05</b> event types
              </div>
              <div>
                <b>03</b> view modes
              </div>
            </div>
          </div>

          <div className="kal-wrap !px-0">
            <div className="toolbar">
              <div className="nav-mo">
                <button type="button" aria-label="Previous month">
                  &lt;
                </button>
                <button type="button" aria-label="Next month">
                  &gt;
                </button>
              </div>
              <div className="mo-label">
                September 2026
                <small>Academic calendar</small>
              </div>
              <div className="filters">
                <button type="button" className="filter on">
                  All
                </button>
                <button type="button" className="filter">
                  Career
                </button>
                <button type="button" className="filter">
                  Service
                </button>
              </div>
              <div className="view-switch">
                <button type="button" className="on">
                  Agenda
                </button>
                <button type="button">Month</button>
              </div>
            </div>

            <div className="cal">
              <div className="cal-header">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                  <div key={day}>{day}</div>
                ))}
              </div>
              {Array.from({ length: 14 }, (_, index) => {
                const current = index + 1;
                return (
                  <div key={current} className={`cal-cell${current === 5 ? " today" : ""}`}>
                    <div className="num">{String(current).padStart(2, "0")}</div>
                    {eventPills[current % eventPills.length] && (
                      <a className={`ev-pill ${eventPills[current % eventPills.length][0]}`} href="#agenda">
                        <b>{eventPills[current % eventPills.length][2]}</b>
                        <span>{eventPills[current % eventPills.length][1]}</span>
                      </a>
                    )}
                  </div>
                );
              })}
            </div>

            <div id="agenda" className="agenda">
              <aside className="agenda-side">
                <h3>Legend</h3>
                <div className="sub">By group</div>
                <ul className="agenda-side-list">
                  <li className="gala">
                    <span>
                      <span className="sw" />
                      Gala
                    </span>
                    <span className="count">02</span>
                  </li>
                  <li className="career">
                    <span>
                      <span className="sw" />
                      Career
                    </span>
                    <span className="count">04</span>
                  </li>
                  <li className="service">
                    <span>
                      <span className="sw" />
                      Service
                    </span>
                    <span className="count">06</span>
                  </li>
                </ul>
              </aside>
              <div className="agenda-list">
                <a className="ag-row" href="#services">
                  <div className="ag-date">
                    Sep <b>05</b>
                  </div>
                  <div className="ag-title">
                    Sample activity
                    <small>VTK</small>
                  </div>
                  <div className="ag-desc">Agenda row with date, title, description, tag and circular go button.</div>
                  <div className="ag-tag">Service</div>
                  <div className="ag-go">-&gt;</div>
                </a>
              </div>
            </div>
          </div>
        </section>

        <section id="services" className="vtk-design">
          <div className="aanbod-wrap !px-0 !py-0">
            <section className="live-ribbon">
              <div className="now-label">
                Now
                <b>Open</b>
              </div>
              <div className="summary">
                Ribbon layout for high-priority service status. <b>Theokot</b> is <span className="op">open now</span>;
                Cursusdienst is <span className="cl">closed</span>.
              </div>
              <a className="btn btn-accent arrow" href="#event">
                Details
              </a>
            </section>

            <section className="services">
              <article className="svc feat">
                <div className="svc-head">
                  <div>
                    <div className="svc-num">001</div>
                    <h2>Theokot</h2>
                    <div className="tagline">Coffee, sandwiches, snacks</div>
                  </div>
                </div>
                <div className="svc-status">
                  <span className="state open">Open</span>
                  <span className="change">Until 17:00</span>
                </div>
                <div className="hours-viz">
                  <div className="day-lbl today">Today</div>
                  <div className="bar-track today-row">
                    <div className="bar" style={{ left: "18%", width: "62%" }}>
                      09:00-17:00
                    </div>
                  </div>
                  <div className="day-lbl">Fri</div>
                  <div className="bar-track">
                    <div className="bar" style={{ left: "22%", width: "44%" }}>
                      10:00-15:00
                    </div>
                  </div>
                </div>
                <dl className="svc-meta">
                  <div>
                    <dt>Location</dt>
                    <dd>VTK basement</dd>
                  </div>
                  <div>
                    <dt>Payment</dt>
                    <dd>Card only</dd>
                  </div>
                </dl>
              </article>

              <article className="svc">
                <div className="svc-head">
                  <div>
                    <div className="svc-num">002</div>
                    <h2>Cursusdienst</h2>
                    <div className="tagline">Courses and books</div>
                  </div>
                </div>
                <div className="svc-status">
                  <span className="state closed">Closed</span>
                  <span className="change">Opens Monday</span>
                </div>
                <div className="menu-grid mt-6">
                  {["Course", "Bundle", "Lab notes", "Sold out"].map((item, index) => (
                    <div key={item} className={`menu-item${index === 3 ? " sold-out" : ""}`}>
                      <div className="nr">0{index + 1}</div>
                      <h4>{item}</h4>
                      <div className="ingr">Compact menu item with ingredients or supporting copy.</div>
                      <div className="price">
                        <span>EUR</span>
                        <b>{index === 3 ? "0" : "12"}</b>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </section>

            <section className="locations">
              <div className="locations-side">
                <div className="label">Location module</div>
                <h3>Map placeholder</h3>
                <p>Use this block when a page needs a practical location section without a live map.</p>
                <dl className="spec">
                  <dt>Campus</dt>
                  <dd>Heverlee</dd>
                  <dt>Room</dt>
                  <dd>Dozaal</dd>
                </dl>
              </div>
              <div className="map-ph">
                <span className="pin-lbl">VTK</span>
                <span className="coords">50.861 N / 4.685 E</span>
              </div>
            </section>
          </div>
        </section>

        <section id="event" className="vtk-event-layout !px-0 !pb-0">
          <figure className="vtk-event-photo ph">
            <span className="ph-label">event media</span>
          </figure>
          <article className="vtk-panel vtk-event-info">
            <h2>Event detail panel</h2>
            <p>
              Event pages use a two-column media and information layout, with compact metadata blocks and action buttons.
            </p>
            <dl className="spec">
              <dt>Date</dt>
              <dd>05 Sep</dd>
              <dt>Time</dt>
              <dd>20:00</dd>
              <dt>Place</dt>
              <dd>Campus Arenberg</dd>
            </dl>
            <div className="vtk-event-actions">
              <a className="vtk-button vtk-button-primary" href="#prose">
                Register
              </a>
              <a className="vtk-button vtk-button-ghost" href="#prose">
                More info
              </a>
            </div>
          </article>
        </section>

        <section id="prose" className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
          <article className="vtk-card prose-vtk max-w-none">
            <h1>Prose content</h1>
            <p>
              This block exercises the global Tiptap prose styles for headings, paragraphs, links, lists and quotes.
            </p>
            <h2>Heading level two</h2>
            <p>
              Links use the VTK underline treatment, like <a href="#admin">this inline example</a>, and body copy keeps a
              readable line height.
            </p>
            <ul>
              <li>Unordered list item</li>
              <li>Second list item with default spacing</li>
            </ul>
            <blockquote>Blockquotes use the yellow accent rail and a soft surface background.</blockquote>
          </article>

          <aside id="admin" className="vtk-admin-main">
            <div data-vtk-ui="card" className="p-5">
              <h1 className="text-2xl font-semibold">Admin surface</h1>
              <p className="mt-2 text-sm text-zinc-500">
                Admin overrides normalize cards, tables, forms, badges and buttons inside .vtk-admin-main.
              </p>
              <div className="mt-5 overflow-hidden rounded-xl border border-zinc-200">
                <table>
                  <thead className="bg-vtk-blue-soft">
                    <tr>
                      <th>Element</th>
                      <th>State</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Table row</td>
                      <td>
                        <span className="bg-vtk-yellow px-2 py-1">Active</span>
                      </td>
                    </tr>
                    <tr>
                      <td>Badge</td>
                      <td>
                        <span className="bg-vtk-blue-soft px-2 py-1">Draft</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <form className="mt-5 grid gap-3">
                <label className="block text-sm">
                  Label
                  <input className="mt-1 w-full rounded border px-3 py-2" defaultValue="Sample input" />
                </label>
                <button type="button" className="inline-flex bg-vtk-blue px-4 py-2 text-sm font-semibold">
                  Admin button
                </button>
              </form>
            </div>
          </aside>
        </section>
      </main>

      <div className="marquee">
        <div className="marquee-track">
          <span>VTK sample page</span>
          <span className="star">*</span>
          <span>Existing classes only</span>
          <span className="star">*</span>
          <span>Manual development reference</span>
          <span className="star">*</span>
          <span>VTK sample page</span>
          <span className="star">*</span>
          <span>Existing classes only</span>
          <span className="star">*</span>
          <span>Manual development reference</span>
        </div>
      </div>
    </div>
  );
}
