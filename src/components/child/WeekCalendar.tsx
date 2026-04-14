import { formatDateKey, getWeekDays } from "@/lib/homework-utils";

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
  const selectedDateObject = new Date(`${selectedDate}T00:00:00`);
  const weekDays = getWeekDays(selectedDateObject);
  const todayStr = formatDateKey(new Date());

  return (
    <div className="rounded-[28px] bg-white p-5 shadow-md ring-1 ring-forest-100">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-forest-500">本周日历</h3>
          <p className="mt-1 text-lg font-bold text-forest-700">点一下日期就能切换</p>
        </div>
        <span className="rounded-full bg-forest-100 px-3 py-1 text-xs font-medium text-forest-600">
          {selectedDate}
        </span>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {weekDays.map((day) => {
          const key = formatDateKey(day);
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
              aria-pressed={isSelected}
              className={`flex min-h-[92px] flex-col items-center justify-between rounded-2xl border px-2 py-3 transition-all ${
                isSelected
                  ? "border-primary bg-primary text-white shadow-md"
                  : "border-transparent bg-forest-50/70 hover:bg-forest-50"
              }`}
            >
              <span className={`text-xs font-medium ${isSelected ? "text-white/80" : "text-forest-400"}`}>
                {DAY_LABELS[(day.getDay() + 6) % 7]}
              </span>
              <span className="text-lg font-bold leading-none">{day.getDate()}</span>
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
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
