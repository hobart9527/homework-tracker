import type { Metadata } from "next";
import "../styles/globals.css";

export const metadata: Metadata = {
  title: "作业小管家",
  description: "帮助家长管理孩子作业的小工具",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-background">{children}</body>
    </html>
  );
}
