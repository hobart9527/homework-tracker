"use client";

import type { ReactNode } from "react";
import ReaderShell from "@/components/ui/ReaderShell";
import {
  ReaderThemeProvider,
  useReaderTheme,
} from "@/components/reading/ReaderThemeContext";
import ReaderSettingsPanel from "@/components/reading/ReaderSettingsPanel";

function ReaderLayoutInner({ children }: { children: ReactNode }) {
  const { theme } = useReaderTheme();
  return (
    <ReaderShell
      readerContent={children}
      theme={theme}
      rightRail={<ReaderSettingsPanel />}
      showRightRail
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
