import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallButton } from "./InstallButton";

function mockStandalone(matches: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: matches && query.includes("standalone"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function offerInstall() {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  const prompt = vi.fn().mockResolvedValue(undefined);
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome: "accepted" }) });
  act(() => {
    window.dispatchEvent(event);
  });
  return { event, prompt };
}

describe("InstallButton", () => {
  afterEach(() => {
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    vi.unstubAllGlobals();
  });

  it("appears even when the browser offered installation before it was mounted", () => {
    mockStandalone(false);
    offerInstall();
    render(<InstallButton />);
    expect(screen.getByRole("button", { name: "Instalar app" })).toBeInTheDocument();
  });

  it("is hidden until the browser offers installation", () => {
    mockStandalone(false);
    render(<InstallButton />);
    expect(screen.queryByRole("button", { name: "Instalar app" })).toBeNull();
  });

  it("appears after beforeinstallprompt and calls prompt on click", async () => {
    mockStandalone(false);
    render(<InstallButton />);
    const { event, prompt } = offerInstall();
    expect(event.defaultPrevented).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Instalar app" }));
    });
    expect(prompt).toHaveBeenCalledOnce();
  });

  it("stays hidden when already installed", () => {
    mockStandalone(true);
    render(<InstallButton />);
    offerInstall();
    expect(screen.queryByRole("button", { name: "Instalar app" })).toBeNull();
  });

  it("hides after appinstalled", () => {
    mockStandalone(false);
    render(<InstallButton />);
    offerInstall();
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(screen.queryByRole("button", { name: "Instalar app" })).toBeNull();
  });
});

describe("InstallButton in the app header", () => {
  it("is reachable from the header once the browser offers installation", async () => {
    mockStandalone(false);
    vi.resetModules();
    vi.doMock("next/navigation", () => ({ usePathname: () => "/inicio/" }));
    vi.doMock("@/components/AccountGate", () => ({ useAccount: () => ({ profile: { role: "teacher", firstNames: "Ana" } }) }));
    vi.doMock("@/workspace/WorkspaceProvider", () => ({
      useWorkspace: () => ({ year: 2026, years: [2026], setYear: vi.fn(), backupWarning: false }),
    }));
    const { AppShell } = await import("@/components/AppShell");
    render(<AppShell>x</AppShell>);
    offerInstall();
    expect(screen.getByRole("banner").querySelector("button")).toHaveAccessibleName("Instalar app");
  });
});
