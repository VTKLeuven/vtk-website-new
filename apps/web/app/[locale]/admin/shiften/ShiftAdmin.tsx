"use client";
import { useState } from "react";
import type { Locale } from "@vtk/i18n";
import { ShiftManage } from "./ShiftManage";
import { ShiftRanking } from "./ShiftRanking";
import { ShiftRewards } from "./ShiftRewards";
import { ShiftManual, type ManualGrantRow } from "./ShiftManual";

export type AdminParticipant = {
  userId: string;
  name: string;
  email: string;
  rNumber: string | null;
  /** Vrije tekst uit het profiel; leeg zolang het lid het niet invulde. */
  phone: string | null;
  payedOut: boolean;
};
export type AdminShift = {
  id: string;
  name: string;
  startTime: Date;
  endTime: Date;
  location: string;
  description: string;
  maxParticipants: number;
  reward: number;
  post: string | null;
  openToInternationals: boolean;
  instructions: string | null;
  participants: AdminParticipant[];
};
export type RankingRow = { userId: string; name: string; post: string; count: number };
export type RewardRow = {
  userId: string;
  name: string;
  email: string;
  paidShiftCount: number;
  paidBonnetjes: number;
  outstandingShiftCount: number;
  outstandingBonnetjes: number;
  outstandingShiftIds: string[];
};
export type Capabilities = {
  canEdit: boolean;
  canReward: boolean;
  canRanking: boolean;
  canManual: boolean;
};

type Tab = "manage" | "ranking" | "rewards" | "manual";

export function ShiftAdmin({
  locale,
  capabilities,
  shifts,
  ranking,
  rewards,
  manualGrants = [],
  postOptions,
  userPostCodes = [],
  isSuperAdmin = false,
  from,
  to,
  year,
  years,
}: {
  locale: Locale;
  capabilities: Capabilities;
  shifts: AdminShift[];
  ranking: RankingRow[];
  rewards: RewardRow[];
  manualGrants?: ManualGrantRow[];
  postOptions: string[];
  userPostCodes?: string[];
  isSuperAdmin?: boolean;
  from: string;
  to: string;
  year: number;
  years: number[];
}) {
  const nl = locale === "nl";
  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: "manage", label: nl ? "Beheer" : "Manage", show: capabilities.canEdit },
    { key: "ranking", label: nl ? "Ranglijst" : "Rankings", show: capabilities.canRanking },
    { key: "rewards", label: nl ? "Bonnetjes" : "Vouchers", show: capabilities.canReward },
    { key: "manual", label: nl ? "Extra shiften" : "Extra shifts", show: capabilities.canManual },
  ];
  const visible = tabs.filter((t) => t.show);
  const [tab, setTab] = useState<Tab>(visible[0]?.key ?? "manage");

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-vtk-navy/10">
        {visible.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.key
                ? "border-vtk-blue text-vtk-blue"
                : "border-transparent text-vtk-muted hover:text-vtk-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "manage" && capabilities.canEdit && (
        <ShiftManage
          locale={locale}
          shifts={shifts}
          postOptions={postOptions}
          userPostCodes={userPostCodes}
          isSuperAdmin={isSuperAdmin}
          from={from}
          to={to}
        />
      )}
      {tab === "ranking" && capabilities.canRanking && (
        <ShiftRanking locale={locale} ranking={ranking} year={year} years={years} />
      )}
      {tab === "rewards" && capabilities.canReward && (
        <ShiftRewards locale={locale} rewards={rewards} year={year} years={years} />
      )}
      {tab === "manual" && capabilities.canManual && (
        <ShiftManual
          locale={locale}
          grants={manualGrants}
          postOptions={postOptions}
          year={year}
          years={years}
        />
      )}
    </div>
  );
}
