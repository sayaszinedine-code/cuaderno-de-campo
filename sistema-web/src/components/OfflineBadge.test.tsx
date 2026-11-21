import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OfflineBadge } from "./OfflineBadge";

const TEXT = "Sin conexión: tus datos se guardan en tu computadora.";

function setOnline(value: boolean) {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);
}

afterEach(() => vi.restoreAllMocks());

describe("OfflineBadge", () => {
  it("is hidden while online", () => {
    setOnline(true);
    render(<OfflineBadge />);
    expect(screen.queryByText(TEXT)).toBeNull();
  });

  it("shows when the browser starts offline", () => {
    setOnline(false);
    render(<OfflineBadge />);
    expect(screen.getByRole("status")).toHaveTextContent(TEXT);
  });

  it("follows the online and offline events", () => {
    setOnline(true);
    render(<OfflineBadge />);
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByText(TEXT)).toBeInTheDocument();
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByText(TEXT)).toBeNull();
  });
});
