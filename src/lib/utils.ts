/**
 * Utility to conditionally join Tailwind CSS class names.
 * Uses template-literal approach without external dependencies.
 */
export function cn(...inputs: (string | undefined | null | false)[]): string {
  return inputs.filter(Boolean).join(" ");
}
