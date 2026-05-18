import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "accent" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "primary", size = "md", ...props }, ref) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium rounded-radius-md transition-all duration-fast active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed";

    const variants = {
      primary:
        "bg-forest-500 text-white hover:bg-forest-600 shadow-elevation-raised",
      secondary:
        "bg-forest-100 text-forest-700 hover:bg-forest-200",
      accent:
        "bg-coral-500 text-white hover:bg-coral-600 shadow-elevation-raised",
      ghost:
        "bg-transparent text-ink-600 hover:bg-ink-100",
      outline:
        "border border-ink-300 text-ink-700 hover:bg-ink-50 bg-transparent",
    };

    const sizes = {
      sm: "px-space-4 py-space-2.5 text-ui-sm",
      md: "px-space-5 py-space-3 text-ui-base",
      lg: "px-space-6 py-space-3 text-ui-lg",
    };

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
