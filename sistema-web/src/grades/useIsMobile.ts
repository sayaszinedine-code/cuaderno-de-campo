"use client";

import { useEffect, useState } from "react";

const QUERY = "(max-width: 767px)";

/** True on phone-width screens; updates when the viewport crosses the breakpoint. */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(
    () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(QUERY);
    setMobile(mq.matches);
    const on = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return mobile;
}
