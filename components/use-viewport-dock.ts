"use client";

import { useEffect } from "react";
import { dockShift, isTextEntry } from "@/lib/viewport-dock";

/**
 * Publishes `--dock-shift` and `data-keyboard` on <html>, so the CSS for the fixed bottom
 * controls can stay on the visible bottom edge and step aside while someone is typing.
 * Mounted once, by the signed-in app shell.
 */
export function useViewportDock() {
  useEffect(() => {
    const root = document.documentElement;
    const coarsePointer = window.matchMedia("(pointer: coarse)");
    let frame = 0;
    let settle = 0;
    let lastShift = -1;
    let lastTyping: boolean | null = null;

    function currentShift() {
      const viewport = window.visualViewport;
      return viewport ? dockShift(window.innerHeight, viewport.offsetTop, viewport.height) : 0;
    }

    function measure() {
      frame = 0;
      const shift = currentShift();
      // Written only on change: scroll fires every frame and an unchanged custom property
      // should not cost a style recalculation.
      if (shift !== lastShift) {
        root.style.setProperty("--dock-shift", `${shift}px`);
        lastShift = shift;
      }
      const typing = coarsePointer.matches && isTextEntry(document.activeElement);
      if (typing !== lastTyping) {
        if (typing) root.dataset.keyboard = "open";
        else delete root.dataset.keyboard;
        lastTyping = typing;
      }
    }

    function schedule() {
      if (!frame) frame = window.requestAnimationFrame(measure);
    }

    function afterFocusLeaves() {
      schedule();
      window.clearTimeout(settle);
      // The keyboard animates away after focus leaves. Once it has gone, a same-position
      // scroll asks the browser to re-synchronise the viewports if they are still apart.
      settle = window.setTimeout(() => {
        if (!isTextEntry(document.activeElement) && currentShift() > 0) window.scrollTo(window.scrollX, window.scrollY);
        schedule();
      }, 350);
    }

    measure();
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", afterFocusLeaves);
    return () => {
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", afterFocusLeaves);
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settle);
      root.style.removeProperty("--dock-shift");
      delete root.dataset.keyboard;
    };
  }, []);
}
