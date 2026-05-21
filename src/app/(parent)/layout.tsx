"use client";

import { usePathname } from "next/navigation";
import ParentShell from "@/components/ui/ParentShell";
import {
  IconList,
  IconDocument,
  IconFox,
  IconSettings,
} from "@/components/ui/icons";

const sidebarItems = [
  { label: "总览", href: "/dashboard", icon: <IconList className="w-5 h-5" /> },
  { label: "作业管理", href: "/homework", icon: <IconDocument className="w-5 h-5" /> },
  { label: "孩子管理", href: "/children", icon: <IconFox className="w-5 h-5" /> },
  { label: "设置", href: "/settings", icon: <IconSettings className="w-5 h-5" /> },
];

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <ParentShell sidebarItems={sidebarItems} activePath={pathname}>
      {children}
    </ParentShell>
  );
}
