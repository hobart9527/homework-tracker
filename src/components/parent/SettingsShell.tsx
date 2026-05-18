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
    <div className="space-y-space-6">
      <header className="rounded-radius-xl bg-forest-500 p-space-4 text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-4">
          <Link href={backHref}>
            <span className="text-xl">←</span>
          </Link>
          <div>
            <h1 className="text-ui-xl font-ui-display font-bold">{title}</h1>
            {description ? (
              <p className="mt-1 text-ui-sm text-white/80">{description}</p>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-space-4">{children}</main>
    </div>
  );
}
