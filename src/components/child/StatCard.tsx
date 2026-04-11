interface StatCardProps {
  icon: string;
  value: string | number;
  label: string;
}

export function StatCard({ icon, value, label }: StatCardProps) {
  return (
    <div className="bg-white rounded-2xl shadow-md p-3 text-center">
      <div className="text-2xl">{icon}</div>
      <div className="text-xl font-bold text-forest-700">{value}</div>
      <div className="text-xs text-forest-500">{label}</div>
    </div>
  );
}
