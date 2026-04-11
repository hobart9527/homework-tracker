import { getWeekDays } from "@/lib/homework-utils";

interface WeekCalendarProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  dailyCompletion: Record<string, { completed: number; total: number }>;
}

const DAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

function DayRing({
  completion,
  size = 32,
  strokeWidth = 3,
}: {
  completion: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - completion / 100);

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#E8FFF0"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={completion === 100 ? "#56AB91" : "#A8E6CF"}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="transition-all duration-500"
      />
    </svg>
  );
}

export function WeekCalendar({
  selectedDate,
  onSelectDate,
  dailyCompletion,
}: WeekCalendarProps) {
  const weekDays = getWeekDays(new Date());
  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <div className="bg-white rounded-2xl shadow-md p-4">
      <h3 className="text-sm font-medium text-forest-700 mb-3">本周</h3>
      <div className="grid grid-cols-7 gap-2">
        {weekDays.map((day) => {
          const key = day.toISOString().split("T")[0];
          const isSelected = key === selectedDate;
          const isToday = key === todayStr;
          const completion = dailyCompletion[key];
          const completionPct =
            completion && completion.total > 0
              ? (completion.completed / completion.total) * 100
              : 0;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDate(key)}
              className={`flex flex-col items-center py-2 rounded-xl transition-all ${
                isSelected
                  ? "bg-primary text-white"
                  : "hover:bg-forest-50"
              }`}
            >
              <span className="text-xs text-forest-400">
                {isSelected ? "" : DAY_LABELS[day.getDay() - 1]}
              </span>
              <span className="text-lg font-bold">{day.getDate()}</span>
              {completion && completion.total > 0 ? (
                <DayRing
                  completion={completionPct}
                  size={20}
                  strokeWidth={2}
                />
              ) : (
                <span className="w-5 h-5" />
              )}
              {isToday && !isSelected && (
                <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
