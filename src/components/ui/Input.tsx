import { InputHTMLAttributes, forwardRef, useId } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", label, error, ...props }, ref) => {
    const fallbackId = useId();
    const inputId = props.id ?? fallbackId;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-ui-sm font-medium text-forest-700 mb-1"
          >
            {label}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          className={`w-full px-space-4 py-space-2 rounded-radius-md border-2 border-ink-300
            focus:border-forest-500 focus:outline-none transition-colors
            ${error ? "border-coral-500" : ""} ${className}`}
          {...props}
        />
        {error && <p className="text-coral-600 text-ui-sm mt-space-1">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
