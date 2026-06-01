"use client";

import type { ReactNode } from "react";
import ReaderShell from "@/components/ui/ReaderShell";
import {
  ReaderThemeProvider,
  useReaderTheme,
  resolveTheme,
} from "@/components/reading/ReaderThemeContext";
import ReaderSettingsPanel from "@/components/reading/ReaderSettingsPanel";

function ReaderLayoutInner({ children }: { children: ReactNode }) {
  const { theme } = useReaderTheme();
  return (
    <ReaderShell
      readerContent={children}
      theme={resolveTheme(theme)}
      rightRail={<ReaderSettingsPanel />}
      showRightRail={false}
    />
  );
}

export default function ReaderLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ReaderThemeProvider>
      <ReaderLayoutInner>{children}</ReaderLayoutInner>
    </ReaderThemeProvider>
  );
}
