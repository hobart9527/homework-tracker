import type { Database } from "@/lib/supabase/types";
import { getHomeworksForDate } from "@/lib/homework-utils";

type Homework = Database["public"]["Tables"]["homeworks"]["Row"];
type Child = Database["public"]["Tables"]["children"]["Row"];

export type HomeworkListFilters = {
  selectedChildId: string;
  date: Date;
};

export type HomeworkListItem = Homework & {
  childName: string;
  isDueToday: boolean;
};

export type HomeworkListSection = {
  title: string;
  items: HomeworkListItem[];
};

export type HomeworkListView = {
  sections: HomeworkListSection[];
};

function sortHomeworkItems(items: HomeworkListItem[]) {
  return [...items].sort((left, right) => {
    if (left.isDueToday !== right.isDueToday) {
      return left.isDueToday ? -1 : 1;
    }

    const leftCreatedAt = left.created_at ? new Date(left.created_at).getTime() : 0;
    const rightCreatedAt = right.created_at ? new Date(right.created_at).getTime() : 0;
    return rightCreatedAt - leftCreatedAt;
  });
}

export function buildHomeworkListView(
  children: Child[],
  homeworks: Homework[],
  filters: HomeworkListFilters
): HomeworkListView {
  const todayIds = new Set(
    getHomeworksForDate(homeworks, filters.date).map((homework) => homework.id)
  );
  const childNameById = new Map(children.map((child) => [child.id, child.name]));
  const items = homeworks
    .map((homework) => ({
      ...homework,
      childName: childNameById.get(homework.child_id) ?? "未知",
      isDueToday: todayIds.has(homework.id),
    }));

  if (filters.selectedChildId !== "all") {
    const childItems = sortHomeworkItems(
      items.filter((item) => item.child_id === filters.selectedChildId)
    );
    const dueToday = childItems.filter((item) => item.isDueToday);
    const other = childItems.filter((item) => !item.isDueToday);

    return {
      sections: [
        { title: "今天会出现", items: dueToday },
        { title: "其他作业", items: other },
      ].filter((section) => section.items.length > 0),
    };
  }

  const sections = children
    .map((child) => ({
      title: child.name,
      items: sortHomeworkItems(
        items.filter((item) => item.child_id === child.id)
      ),
    }))
    .filter((section) => section.items.length > 0);

  return { sections };
}
