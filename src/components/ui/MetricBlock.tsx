interface MetricBlockProps {
  skin: "parent" | "child";
  label: string;
  value: string | number;
  trend?: "up" | "down" | "flat";
  color?: "default" | "success" | "warning" | "danger";
  className?: string;
}

/**
 * MetricBlock — compact or spacious stat display.
 *
 * - parent: compact px-4 py-3, text-xs uppercase label + text-xl value
 * - child:  spacious px-6 py-4, text-sm label + text-2xl value
 *
 * Usage:
 *   <MetricBlock skin="parent" label="Completed" value={12} trend="up" />
 *   <MetricBlock skin="child" label="积分" value={340} color="success" />
 */
export default function MetricBlock({
  skin,
  label,
  value,
  trend,
  color = "default",
  className = "",
}: MetricBlockProps) {
  const trendIcon: Record<NonNullable<typeof trend>, string> = {
    up: "↑",
    down: "↓",
    flat: "→",
  };

  const trendColor: Record<NonNullable<typeof trend>, string> = {
    up: "text-emerald-600",
    down: "text-coral-600",
    flat: "text-ink-400",
  };

  const valueColorMap: Record<NonNullable<typeof color>, string> = {
    default: "text-ink-800",
    success: "text-emerald-600",
    warning: "text-amber-500",
    danger: "text-rose-500",
  };

  if (skin === "parent") {
    return (
      <div
        className={`inline-flex items-center gap-3 px-4 py-3 bg-white ring-1 ring-ink-300 rounded-radius-md ${className}`.trim()}
      >
        <div className="flex-1 min-w-0">
          <span className="block text-xs font-medium text-ink-500 tracking-wide uppercase">
            {label}
          </span>
          <span
            className={`block text-xl font-semibold ${valueColorMap[color]}`}
          >
            {value}
          </span>
        </div>
        {trend && (
          <span className={`text-sm font-medium ${trendColor[trend]}`}>
            {trendIcon[trend]}
          </span>
        )}
      </div>
    );
  }

  // child skin — spacious, square-ish
  return (
    <div
      className={`inline-flex flex-col items-start gap-1 px-6 py-4 bg-white ring-1 ring-cream-200/40 rounded-radius-lg ${className}`.trim()}
    >
      <span className="text-sm font-medium text-ink-500">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`text-2xl font-bold ${valueColorMap[color]}`}>
          {value}
        </span>
        {trend && (
          <span className={`text-base font-medium ${trendColor[trend]}`}>
            {trendIcon[trend]}
          </span>
        )}
      </div>
    </div>
  );
}
