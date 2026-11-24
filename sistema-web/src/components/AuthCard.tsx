import Link from "next/link";
import type { ReactNode } from "react";

/** Shared frame for the public account screens: logo, app name and a centered card. */
export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="mb-6 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- static export, no image optimizer */}
        <img src="/icons/icon-192.png" alt="" width={48} height={48} className="size-12 rounded-2xl shadow" />
        <span className="text-xl font-bold">Cuaderno de Campo</span>
      </Link>
      <section className="card page-enter w-full max-w-md p-6 shadow-xl sm:p-8">
        <h1 className="mb-6 text-2xl font-bold">{title}</h1>
        {children}
      </section>
    </main>
  );
}
