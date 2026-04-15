import { formatDateKey, getWeekDays } from "@/lib/homework-utils";
import { useTranslation } from "@/hooks/useTranslation";

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

function getDayTone(
  dateKey: string,
  completion?: { completed: number; total: number }
) {
  const todayKey = formatDateKey(new Date());

  if (!completion || completion.total === 0) {
    return {
      label: "无任务",
      ringColor: "rgb(203 213 225)",
      textColor: "text-slate-400",
    };
  }

  if (completion.completed >= completion.total) {
    return {
      label: "已完成",
      ringColor: "rgb(34 197 94)",
      textColor: "text-emerald-600",
    };
  }

  if (completion.completed > 0) {
    return {
      label: "进行中",
      ringColor: "rgb(34 197 94)",
      textColor: "text-sky-600",
    };
  }

  if (dateKey < todayKey) {
    // Overdue: show completion ratio
    if (completion && completion.completed > 0) {
      return {
        label: "逾期进行中",
        ringColor: "rgb(34 197 94)",
        textColor: "text-rose-500",
      };
    }
    return {
      label: "未完成",
      ringColor: "rgb(248 113 113)",
      textColor: "text-rose-500",
    };
  }

  return {
    label: "未开始",
    ringColor: "rgb(203 213 225)",
    textColor: "text-slate-400",
  };
}

function DayRing({
  completion,
  strokeColor,
  size = 44,
  strokeWidth = 3,
  children,
}: {
  completion: number;
  strokeColor: string;
  size?: number;
  strokeWidth?: number;
  children: React.ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - completion / 100);

  return (
    <div className="relative">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgb(238 242 235)"
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
          className="transition-all duration-300"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  );
}

export function WeekCalendar({
  selectedDate,
  onSelectDate,
  dailyCompletion,
}: WeekCalendarProps) {
  const { t } = useTranslation();
  const selectedDateObject = new Date(`${selectedDate}T00:00:00`);
  const weekDays = getWeekDays(selectedDateObject);
  const currentWeekStart = getWeekDays(new Date())[0];
  const canMoveForward = !isSameWeek(selectedDateObject, new Date()) && formatDateKey(weekDays[0]) < formatDateKey(currentWeekStart);
  const todayStr = formatDateKey(new Date());

  return (
    <div className="rounded-[28px] bg-white p-5 shadow-md ring-1 ring-forest-100">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-forest-500">{t("child.weekCalendar.title")}</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSelectDate(formatDateKey(shiftDateByDays(selectedDateObject, -7)))}
            className="rounded-full bg-forest-50 px-3 py-1 text-xs font-medium text-forest-700 transition hover:bg-forest-100"
          >
            {t("child.weekCalendar.previousWeek")}
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
            {t("child.weekCalendar.nextWeek")}
          </button>
          <span className="rounded-full bg-forest-100 px-3 py-1 text-xs font-medium text-forest-600">
            {selectedDate}
          </span>
        </div>
      </div>
      <div className="mb-3 flex items-center gap-4 text-[10px] text-slate-400">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full ring-1 ring-slate-200" />
          {t("child.weekCalendar.notStarted")}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          {t("child.weekCalendar.inProgress")}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-rose-400" />
          {t("child.weekCalendar.overdue")}
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
          const tone = getDayTone(key, completion);

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDate(key)}
              aria-pressed={isSelected}
              aria-label={`${key} ${tone.label}${
                completion && completion.total > 0
                  ? `, ${completion.completed}/${completion.total}`
                  : ""
              }`}
              className={`flex flex-col items-center gap-1 rounded-xl px-2 py-3 transition-all ${
                isSelected
                  ? "bg-forest-50 shadow-sm"
                  : "hover:bg-forest-50/50"
              }`}
            >
              <span className={`text-[10px] font-medium ${tone.textColor}`}>
                {DAY_LABELS[(day.getDay() + 6) % 7]}
              </span>
              <div className="relative">
                <DayRing
                  completion={completionPct}
                  strokeColor={tone.ringColor}
                  size={36}
                  strokeWidth={3}
                >
                  <span className={`text-sm font-bold ${tone.textColor}`}>
                    {day.getDate()}
                  </span>
                </DayRing>
                {isToday && (
                  <span className="absolute -bottom-2 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-primary shadow-sm ring-2 ring-white" />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
