import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./Toast";

let show: (message: string) => void = () => {};
function Grab() {
  show = useToast();
  return null;
}

describe("Toast", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows the message and hides it after 3 seconds", () => {
    render(
      <ToastProvider>
        <Grab />
      </ToastProvider>,
    );
    act(() => show("Nota guardada."));
    expect(screen.getByText("Nota guardada.")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.queryByText("Nota guardada.")).toBeNull();
  });

  it("a newer toast is not hidden by the older timer", () => {
    render(
      <ToastProvider>
        <Grab />
      </ToastProvider>,
    );
    act(() => show("A"));
    act(() => vi.advanceTimersByTime(2000));
    act(() => show("B"));
    act(() => vi.advanceTimersByTime(1500));
    expect(screen.queryByText("A")).toBeNull();
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("useToast without a provider is a no-op", () => {
    render(<Grab />);
    expect(() => show("x")).not.toThrow();
  });
});
