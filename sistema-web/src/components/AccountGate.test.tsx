import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountState, Profile } from "@/auth/session";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

import { AccountGate, useAccount } from "./AccountGate";

const profile: Profile = {
  id: "u1", firstNames: "Ana", lastNames: "Paz", email: "a@x.pe", institution: "",
  ugel: "", region: "", status: "active", role: "teacher",
};

function Child() {
  const { profile } = useAccount();
  return <p>Hola {profile.firstNames}</p>;
}

function renderGate(state: AccountState) {
  return render(
    <AccountGate resolve={() => Promise.resolve(state)}>
      <Child />
    </AccountGate>,
  );
}

beforeEach(() => replace.mockClear());

describe("AccountGate", () => {
  it("shows a loading message first", () => {
    render(<AccountGate resolve={() => new Promise(() => {})}>x</AccountGate>);
    expect(screen.getByText("Verificando tu cuenta…")).toBeInTheDocument();
  });

  it("renders children with the profile when active", async () => {
    renderGate({ kind: "active", profile });
    expect(await screen.findByText("Hola Ana")).toBeInTheDocument();
  });

  it("explains pending accounts", async () => {
    renderGate({ kind: "pending", profile: { ...profile, status: "pending" } });
    expect(
      await screen.findByText("Tu cuenta está en revisión. Te avisaremos cuando sea aprobada."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Hola Ana")).not.toBeInTheDocument();
  });

  it("explains suspended accounts with a link to /cuenta/", async () => {
    renderGate({ kind: "suspended", profile: { ...profile, status: "suspended" } });
    expect(
      await screen.findByText("Tu cuenta está suspendida. Puedes abrir tu carpeta y exportar tus datos."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /cuenta/i })).toHaveAttribute("href", "/cuenta/");
  });

  it("renders children for suspended accounts when allowInactive", async () => {
    render(
      <AccountGate allowInactive resolve={() => Promise.resolve({ kind: "suspended", profile: { ...profile, status: "suspended" } })}>
        <Child />
      </AccountGate>,
    );
    expect(await screen.findByText("Hola Ana")).toBeInTheDocument();
  });

  it("asks to connect when the offline check expired", async () => {
    renderGate({ kind: "offline-expired" });
    expect(await screen.findByText("Conéctate a internet para verificar tu cuenta.")).toBeInTheDocument();
  });

  it("redirects to /login/ when signed out", async () => {
    renderGate({ kind: "signed-out" });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login/"));
  });

  it("shows an error when resolving fails", async () => {
    render(<AccountGate resolve={() => Promise.reject(new Error("x"))}>x</AccountGate>);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
