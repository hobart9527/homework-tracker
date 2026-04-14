"use client";

import { ParentDayDetailPanel } from "@/components/parent/ParentDayDetailPanel";
import type { ParentChildDashboardDetail } from "@/lib/parent-dashboard";

interface TodayOverviewProps {
  detail: ParentChildDashboardDetail;
  selectedDate: string;
}

export function TodayOverview({ detail, selectedDate }: TodayOverviewProps) {
  return <ParentDayDetailPanel detail={detail} selectedDate={selectedDate} />;
}
