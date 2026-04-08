"use client";

import type { Database } from "@/lib/supabase/types";

type Child = Database["public"]["Tables"]["children"]["Row"];

interface ChildSelectorProps {
  children: Child[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ChildSelector({
  children,
  selectedId,
  onSelect,
}: ChildSelectorProps) {
  return (
    <div className="flex gap-2 p-1 bg-forest-100 rounded-xl">
      {children.map((child) => (
        <button
          key={child.id}
          onClick={() => onSelect(child.id)}
          className={`flex-1 flex items-center gap-2 px-4 py-2 rounded-lg transition-all
            ${
              selectedId === child.id
                ? "bg-white shadow-md text-primary"
                : "text-forest-600 hover:text-forest-700"
            }`}
        >
          <span className="text-xl">{child.avatar || "🦊"}</span>
          <span className="font-medium">{child.name}</span>
        </button>
      ))}
    </div>
  );
}
