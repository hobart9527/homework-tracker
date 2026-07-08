import type { ReactNode } from "react";
import { Button } from "./Button";

interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  action?: EmptyStateAction;
}

export function EmptyState({
  icon,
  title,
  subtitle,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-space-6 py-space-12 rounded-radius-2xl bg-gradient-to-br from-cream-100 to-coral-50 shadow-elevation-floating">
      {icon ? (
        <div className="text-6xl mb-4 text-forest-500">{icon}</div>
      ) : (
        <div className="w-16 h-16 mb-4 rounded-full bg-forest-100 flex items-center justify-center text-forest-500 text-3xl">
          ?
        </div>
      )}
      <h3 className="font-ui-display text-ui-xl font-bold text-forest-800 mb-2">{title}</h3>
      {subtitle && (
        <p className="text-ui-sm text-ink-500 mb-6 max-w-xs">{subtitle}</p>
      )}
      {action && (
        <Button variant="default" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
