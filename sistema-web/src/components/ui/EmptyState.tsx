import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";

/** Friendly "nothing here yet" card with an icon and an optional action. */
export function EmptyState({ icon, text, action }: { icon: IconName; text: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-5 py-10 text-center">
      <span className="bg-accent-soft text-primary flex size-14 items-center justify-center rounded-full">
        <Icon name={icon} className="size-7" />
      </span>
      <p className="max-w-md">{text}</p>
      {action}
    </div>
  );
}
