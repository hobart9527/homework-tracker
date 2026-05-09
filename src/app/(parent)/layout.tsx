import ParentShell from "@/components/ui/ParentShell";
import {
  IconList,
  IconDocument,
  IconFox,
  IconSettings,
} from "@/components/ui/icons";

const sidebarItems = [
  { label: "Dashboard", href: "/dashboard", icon: <IconList className="w-5 h-5" /> },
  { label: "作业管理", href: "/homework", icon: <IconDocument className="w-5 h-5" /> },
  { label: "孩子", href: "/children", icon: <IconFox className="w-5 h-5" /> },
  { label: "设置", href: "/settings", icon: <IconSettings className="w-5 h-5" /> },
];

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return <ParentShell sidebarItems={sidebarItems}>{children}</ParentShell>;
}
