"use client";

interface Category {
  key: string;
  label: string;
}

interface CategoryTrackProps {
  categories: Category[];
  activeCategory: string;
  onCategoryChange: (category: string) => void;
}

export function CategoryTrack({ categories, activeCategory, onCategoryChange }: CategoryTrackProps) {
  return (
    <div className="relative -mx-4 px-4">
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
        {categories.map((cat) => {
          const isActive = cat.key === activeCategory;
          return (
            <button
              key={cat.key}
              onClick={() => onCategoryChange(isActive ? "" : cat.key)}
              className={`relative flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 min-h-[44px] ${
                isActive
                  ? "bg-forest-600 text-white shadow-md"
                  : "bg-white text-ink-600 hover:bg-cream-50 ring-1 ring-cream-200"
              }`}
            >
              {cat.label}
              {isActive && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-white rounded-full mb-1" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
