"use client";
import { useState } from "react";
import type { Locale } from "@vtk/i18n";
import { ShiftManage } from "./ShiftManage";
import { ShiftRanking } from "./ShiftRanking";
import { ShiftRewards } from "./ShiftRewards";

export type AdminParticipant = { userId: string; name: string; email: string; payedOut: boolean };
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
  participants: AdminParticipant[];
};
export type RankingRow = { userId: string; name: string; post: string; count: number };
export type RewardRow = {
  userId: string;
  name: string;
  email: string;
  claimedShifts: number;
  claimedReward: number;
  unclaimedShifts: number;
  unclaimedReward: number;
  unclaimedShiftIds: string[];
};
export type Capabilities = { canEdit: boolean; canReward: boolean; canRanking: boolean };

type Tab = "manage" | "ranking" | "rewards";

export function ShiftAdmin({
  locale,
  capabilities,
  shifts,
  ranking,
  rewards,
  postOptions,
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
  postOptions: string[];
  from: string;
  to: string;
  year: number;
  years: number[];
}) {
  const nl = locale === "nl";
  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: "manage", label: nl ? "Beheer" : "Manage", show: capabilities.canEdit },
    { key: "ranking", label: nl ? "Ranglijst" : "Rankings", show: capabilities.canRanking },
    { key: "rewards", label: nl ? "Vergoedingen" : "Rewards", show: capabilities.canReward },
  ];
  const visible = tabs.filter((t) => t.show);
  const [tab, setTab] = useState<Tab>(visible[0]?.key ?? "manage");

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-zinc-200">
        {visible.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.key
                ? "border-vtk-blue text-vtk-blue"
                : "border-transparent text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "manage" && capabilities.canEdit && (
        <ShiftManage locale={locale} shifts={shifts} postOptions={postOptions} from={from} to={to} />
      )}
      {tab === "ranking" && capabilities.canRanking && (
        <ShiftRanking locale={locale} ranking={ranking} year={year} years={years} />
      )}
      {tab === "rewards" && capabilities.canReward && (
        <ShiftRewards locale={locale} rewards={rewards} year={year} years={years} />
      )}
    </div>
  );
}
