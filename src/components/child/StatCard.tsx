import React from "react";

interface StatCardProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
}

export function StatCard({ icon, value, label }: StatCardProps) {
  return (
    <div className="bg-cream-50 rounded-radius-lg shadow-elevation-floating p-4 text-center">
      <div className="text-2xl flex items-center justify-center">{icon}</div>
      <div className="text-xl font-bold text-forest-700">{value}</div>
      <div className="text-xs text-ink-500">{label}</div>
    </div>
  );
}
