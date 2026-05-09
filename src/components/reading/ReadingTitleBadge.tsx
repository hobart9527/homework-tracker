"use client";

interface ReadingTitleBadgeProps {
  accuracy: number; // 0-100
  speed: number; // words per minute
  streak: number; // consecutive days
}

interface Title {
  name: string;
  icon: string;
  condition: string;
}

function calculateTitle({ accuracy, speed, streak }: ReadingTitleBadgeProps): Title {
  if (streak >= 7 && accuracy >= 90) {
    return { name: "阅读大师", icon: "👑", condition: "连续7天准确率90%+" };
  }
  if (speed > 200 && accuracy >= 85) {
    return { name: "速读新星", icon: "⚡", condition: "速度200词/分+准确率85%+" };
  }
  if (accuracy >= 95) {
    return { name: "完美阅读者", icon: "💎", condition: "准确率95%+" };
  }
  if (streak >= 7) {
    return { name: "坚持不懈", icon: "🔥", condition: "连续7天阅读" };
  }
  if (accuracy >= 80) {
    return { name: "阅读达人", icon: "⭐", condition: "准确率80%+" };
  }
  if (speed > 150) {
    return { name: "快速阅读", icon: "🚀", condition: "速度150词/分+" };
  }
  return { name: "阅读新手", icon: "🌱", condition: "开始阅读之旅" };
}

export function ReadingTitleBadge(props: ReadingTitleBadgeProps) {
  const title = calculateTitle(props);

  return (
    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-honey-100 to-coral-100 border border-honey-200 shadow-sm">
      <span className="text-xl">{title.icon}</span>
      <div>
        <div className="text-sm font-bold text-forest-800">{title.name}</div>
        <div className="text-xs text-ink-500">{title.condition}</div>
      </div>
    </div>
  );
}
