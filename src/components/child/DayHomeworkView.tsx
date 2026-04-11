import { useState } from "react";
import { getHomeworksForDate } from "@/lib/homework-utils";
import { ChildHomeworkCard } from "@/components/child/ChildHomeworkCard";
import { CheckInModal } from "@/components/child/CheckInModal";
import type { Database } from "@/lib/supabase/types";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type CheckIn = Database["public"]["Tables"]["check_ins"]["Row"];

interface DayHomeworkViewProps {
  date: string;
  homeworks: Homework[];
  checkIns: CheckIn[];
  onRefresh?: () => void;
}

export function DayHomeworkView({
  date,
  homeworks,
  checkIns,
  onRefresh,
}: DayHomeworkViewProps) {
  const [selectedHomework, setSelectedHomework] = useState<Homework | null>(null);

  const dateObj = new Date(`${date}T00:00:00`);
  const dayHomeworks = getHomeworksForDate(homeworks, dateObj);

  const dayStart = new Date(`${date}T00:00:00`);
  const dayEnd = new Date(`${date}T23:59:59`);

  const isCompleted = (hwId: string) =>
    checkIns.some(
      (ci) =>
        ci.homework_id === hwId &&
        new Date(ci.completed_at) >= dayStart &&
        new Date(ci.completed_at) <= dayEnd
    );

  const isOverdue = (hw: Homework) => {
    if (!hw.daily_cutoff_time) return false;
    const now = new Date();
    const [hours, minutes] = hw.daily_cutoff_time.split(":").map(Number);
    const cutoff = new Date();
    cutoff.setHours(hours, minutes, 0, 0);
    return now > cutoff;
  };

  return (
    <div>
      <div className="space-y-3">
        {dayHomeworks.length === 0 ? (
          <div className="text-center py-12">
            <span className="text-6xl">🎉</span>
            <h2 className="text-xl font-bold text-forest-700 mt-4">
              今天没有作业！
            </h2>
            <p className="text-forest-500 mt-2">好好休息吧～</p>
          </div>
        ) : (
          dayHomeworks.map((hw) => (
            <ChildHomeworkCard
              key={hw.id}
              homework={hw}
              isCompleted={isCompleted(hw.id)}
              isOverdue={!isCompleted(hw.id) && isOverdue(hw)}
              onComplete={() => setSelectedHomework(hw)}
            />
          ))
        )}
      </div>

      {selectedHomework && (
        <CheckInModal
          homework={selectedHomework}
          isOpen={!!selectedHomework}
          onClose={() => setSelectedHomework(null)}
          onSuccess={() => {
            setSelectedHomework(null);
            onRefresh?.();
          }}
        />
      )}
    </div>
  );
}
