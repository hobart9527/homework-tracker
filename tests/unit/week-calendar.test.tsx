import { createElement } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WeekCalendar } from "@/components/child/WeekCalendar";

describe("WeekCalendar", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("moves to the previous week when the child taps the back button", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-14T12:00:00"));

    const onSelectDate = vi.fn();

    render(
      <WeekCalendar
        selectedDate="2026-04-14"
        onSelectDate={onSelectDate}
        dailyCompletion={{}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "上一周" }));

    expect(onSelectDate).toHaveBeenCalledWith("2026-04-07");
  });

  it("blocks moving into a future week", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-14T12:00:00"));

    render(
      <WeekCalendar
        selectedDate="2026-04-14"
        onSelectDate={vi.fn()}
        dailyCompletion={{}}
      />
    );

    expect(screen.getByRole("button", { name: "下一周" })).toBeDisabled();
  });
});
