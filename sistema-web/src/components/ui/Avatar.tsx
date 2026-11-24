/** 1–2 uppercase initials from the first and last word; "?" when there is no name. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toLocaleUpperCase("es");
}

/** Stable hue (0–359) for a name, so a child always gets the same color. */
export function avatarHue(name: string): number {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)!) % 360;
  return hash;
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const hue = avatarHue(name);
  return (
    <span
      aria-hidden="true"
      className={`avatar ${size === "sm" ? "size-8 text-xs" : "size-11 text-sm"}`}
      style={{ "--avatar-hue": hue } as React.CSSProperties}
    >
      {initials(name)}
    </span>
  );
}
