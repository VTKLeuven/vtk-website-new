"use client";
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
  /** PAL+-sessies die deze persoon gaf: dezelfde bonnetjes, een andere bron. */
  paidPalCount: number;
  outstandingPalCount: number;
  outstandingPalSessionIds: string[];
};
export type Capabilities = {
  canEdit: boolean;
  canReward: boolean;
  canRanking: boolean;
  canManual: boolean;
};

/** Elk tabblad is een eigen route onder /admin/shiften; zie de layout. */
export type ShiftAdminTab = "manage" | "ranking" | "rewards" | "manual";

export function ShiftAdmin({
  tab,
  locale,
  capabilities,
  shifts,
  ranking,
  rewards,
  manualGrants = [],
  postOptions,
  userPostCodes = [],
  manageAllPosts = false,
  from,
  to,
  year,
  years,
}: {
  tab: ShiftAdminTab;
  locale: Locale;
  capabilities: Capabilities;
  shifts: AdminShift[];
  ranking: RankingRow[];
  rewards: RewardRow[];
  manualGrants?: ManualGrantRow[];
  postOptions: string[];
  userPostCodes?: string[];
  /** Superadmin of `shift.editAll`: elke shift openen, elke post kiezen. */
  manageAllPosts?: boolean;
  from: string;
  to: string;
  year: number;
  years: number[];
}) {
  return (
    <div className="space-y-4">
      {tab === "manage" && capabilities.canEdit && (
        <ShiftManage
          locale={locale}
          shifts={shifts}
          postOptions={postOptions}
          userPostCodes={userPostCodes}
          manageAllPosts={manageAllPosts}
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
