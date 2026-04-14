import { formatDateKey, getWeekDays } from "@/lib/homework-utils";

interface WeekCalendarProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  dailyCompletion: Record<string, { completed: number; total: number }>;
}

const DAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

function shiftDateByDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(date.getDate() + days);
  return nextDate;
}

function isSameWeek(left: Date, right: Date) {
  return formatDateKey(getWeekDays(left)[0]) === formatDateKey(getWeekDays(right)[0]);
}

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

  // 颜色与父页面日历圆环颜色释义一致
  // 已完成(100%): 绿色 rgb(34 197 94)
  // 进行中(1-99%): 蓝色 rgb(59 130 246)
  // 未开始/无任务(0%): 灰色 rgb(148 163 184)
  const strokeColor =
    completion === 100
      ? "rgb(34 197 94)"
      : completion > 0
        ? "rgb(59 130 246)"
        : "rgb(148 163 184)";

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgb(226 232 240)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={strokeColor}
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
  const currentWeekStart = getWeekDays(new Date())[0];
  const canMoveForward = !isSameWeek(selectedDateObject, new Date()) && formatDateKey(weekDays[0]) < formatDateKey(currentWeekStart);
  const todayStr = formatDateKey(new Date());

  return (
    <div className="rounded-[28px] bg-white p-5 shadow-md ring-1 ring-forest-100">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-forest-500">本周日历</h3>
                  </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSelectDate(formatDateKey(shiftDateByDays(selectedDateObject, -7)))}
            className="rounded-full bg-forest-50 px-3 py-1 text-xs font-medium text-forest-700 transition hover:bg-forest-100"
          >
            上一周
          </button>
          <button
            type="button"
            onClick={() => {
              if (!canMoveForward) {
                return;
              }

              onSelectDate(formatDateKey(shiftDateByDays(selectedDateObject, 7)));
            }}
            disabled={!canMoveForward}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              canMoveForward
                ? "bg-forest-50 text-forest-700 hover:bg-forest-100"
                : "cursor-not-allowed bg-forest-50 text-forest-300"
            }`}
          >
            下一周
          </button>
          <span className="rounded-full bg-forest-100 px-3 py-1 text-xs font-medium text-forest-600">
            {selectedDate}
          </span>
        </div>
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
