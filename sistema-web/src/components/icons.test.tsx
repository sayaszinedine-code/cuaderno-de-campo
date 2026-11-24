import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon, ICON_NAMES } from "./icons";

describe("Icon", () => {
  it("renders a decorative svg for every icon name", () => {
    expect(ICON_NAMES.length).toBe(20);
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} />);
      const svg = container.querySelector("svg");
      expect(svg, name).not.toBeNull();
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg!.querySelectorAll("path, circle, rect, line, polyline").length, name).toBeGreaterThan(0);
      unmount();
    }
  });
});
