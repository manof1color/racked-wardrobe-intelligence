"use client";

import { useEffect, useState } from "react";

/**
 * A read-only readout of the numbers the bottom dock is placed from, shown only when the page address
 * carries `?viewport=debug`. It exists so a stranded tab bar on a real phone can be reported with a
 * screenshot of the actual measurements. It reads the screen and nothing else, and sends nothing.
 */
export function ViewportDebug() {
  const [lines, setLines] = useState<string[] | null>(null);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("viewport") !== "debug") return;
    let frame = 0;
    const read = () => {
      frame = 0;
      const viewport = window.visualViewport;
      const root = document.documentElement;
      setLines([
        `inner ${window.innerWidth}×${window.innerHeight}`,
        `client ${root.clientWidth}×${root.clientHeight}`,
        `visual ${viewport ? `${Math.round(viewport.width)}×${Math.round(viewport.height)} top ${Math.round(viewport.offsetTop)} scale ${viewport.scale.toFixed(2)}` : "none"}`,
        `screen ${window.screen.width}×${window.screen.height}`,
        `dock-shift ${getComputedStyle(root).getPropertyValue("--dock-shift").trim() || "0px"}`,
        `standalone ${window.matchMedia("(display-mode: standalone)").matches ? "yes" : "no"} · keyboard ${root.dataset.keyboard ?? "closed"}`,
      ]);
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(read); };
    read();
    const timer = window.setInterval(schedule, 1000);
    window.visualViewport?.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    return () => { window.clearInterval(timer); window.cancelAnimationFrame(frame); window.visualViewport?.removeEventListener("resize", schedule); window.removeEventListener("scroll", schedule); };
  }, []);
  if (!lines) return null;
  return <pre className="viewport-debug" aria-hidden="true">{lines.join("\n")}</pre>;
}
