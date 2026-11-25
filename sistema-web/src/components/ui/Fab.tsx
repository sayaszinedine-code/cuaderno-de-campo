"use client";

import Link from "next/link";
import { Icon } from "@/components/icons";
import { usePathname } from "next/navigation";
import { sectionColor } from "@/components/sections";

/** Floating round «+» for the screen's main action, on phones only (desktop keeps the header button). */
export function Fab({ href, onClick, label }: { href?: string; onClick?: () => void; label: string }) {
  const sec = `sec-${sectionColor(usePathname() ?? "/")}`;
  const icon = <Icon name="mas-simple" className="size-7" />;
  if (href) {
    return (
      <Link href={href} aria-label={label} title={label} className={`fab ${sec} md:hidden`} onClick={onClick}>
        {icon}
      </Link>
    );
  }
  return (
    <button type="button" aria-label={label} title={label} className={`fab ${sec} md:hidden`} onClick={onClick}>
      {icon}
    </button>
  );
}
