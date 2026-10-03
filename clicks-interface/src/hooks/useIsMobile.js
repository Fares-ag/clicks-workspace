import { useState, useEffect } from "react";

/** Match admin shell drawer breakpoint (AdminLayout). */
export const MOBILE_BREAKPOINT_PX = 900;

export function useIsMobile(breakpointPx = MOBILE_BREAKPOINT_PX) {
  const query = `(max-width: ${breakpointPx}px)`;

  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e) => setIsMobile(e.matches);
    onChange(mql);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return isMobile;
}
