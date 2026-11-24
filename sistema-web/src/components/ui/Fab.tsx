import Link from "next/link";
import { Icon } from "@/components/icons";

/** Floating round «+» for the screen's main action, on phones only (desktop keeps the header button). */
export function Fab({ href, onClick, label }: { href?: string; onClick?: () => void; label: string }) {
  const icon = <Icon name="mas-simple" className="size-7" />;
  if (href) {
    return (
      <Link href={href} aria-label={label} title={label} className="fab md:hidden">
        {icon}
      </Link>
    );
  }
  return (
    <button type="button" aria-label={label} title={label} className="fab md:hidden" onClick={onClick}>
      {icon}
    </button>
  );
}
