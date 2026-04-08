"use client";

import { useState, useRef, useEffect } from "react";

interface PasscodeInputProps {
  length?: number;
  onComplete: (passcode: string) => void;
  error?: string;
}

export function PasscodeInput({
  length = 4,
  onComplete,
  error,
}: PasscodeInputProps) {
  const [values, setValues] = useState<string[]>(Array(length).fill(""));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newValues = [...values];
    newValues[index] = value.slice(-1);
    setValues(newValues);

    if (value && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    if (newValues.every((v) => v) && newValues.join("").length === length) {
      onComplete(newValues.join(""));
    }
  };

  const handleKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Backspace" && !values[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex gap-3">
        {values.map((value, index) => (
          <input
            key={index}
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            type="password"
            inputMode="numeric"
            maxLength={1}
            value={value}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            className={`w-14 h-14 text-center text-2xl font-bold rounded-xl border-2
              transition-all bg-white
              ${
                error
                  ? "border-red-500"
                  : value
                  ? "border-primary"
                  : "border-forest-200"
              }`}
          />
        ))}
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
    </div>
  );
}
