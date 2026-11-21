import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({ onUpdate: undefined as undefined | ((apply: () => void) => void) }));
vi.mock("./register", () => ({
  registerInBrowser: (onUpdate: (apply: () => void) => void) => {
    captured.onUpdate = onUpdate;
    return Promise.resolve(null);
  },
}));

import { PwaUpdater } from "./PwaUpdater";

describe("PwaUpdater", () => {
  it("offers the new version and applies it only on click", () => {
    render(<PwaUpdater />);
    expect(screen.queryByRole("status")).toBeNull();
    const apply = vi.fn();
    act(() => captured.onUpdate?.(apply));
    expect(screen.getByRole("status")).toHaveTextContent("Hay una nueva versión. Recargar.");
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Recargar." }));
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
