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
    <div className="min-h-screen bg-background">
      <header className="bg-primary p-4 text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-4">
          <Link href={backHref}>
            <span className="text-xl">←</span>
          </Link>
          <div>
            <h1 className="text-xl font-bold">{title}</h1>
            {description ? (
              <p className="mt-1 text-sm text-white/80">{description}</p>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 p-4">{children}</main>
    </div>
  );
}
