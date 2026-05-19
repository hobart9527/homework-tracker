"use client";

import Link from "next/link";

type SettingsShellProps = {
  title: string;
  description?: string;
  backHref?: string;
  children: React.ReactNode;
};

export function SettingsShell({
  title,
  description,
  backHref = "/settings",
  children,
}: SettingsShellProps) {
  return (
    <div className="max-w-7xl mx-auto space-y-space-6">
      <header className="rounded-radius-xl border border-ink-300 bg-white p-space-4 shadow-elevation-raised">
        <div className="flex items-center gap-4">
          <Link href={backHref} className="rounded-radius-md p-1 text-forest-700 hover:bg-forest-50 transition-colors">
            <span className="text-xl">←</span>
          </Link>
          <div>
            <h1 className="text-ui-xl font-ui-display font-bold text-forest-800">{title}</h1>
            {description ? (
              <p className="mt-1 text-ui-sm text-ink-500">{description}</p>
            ) : null}
          </div>
        </div>
      </header>

      <main className="space-y-space-4">{children}</main>
    </div>
  );
}
