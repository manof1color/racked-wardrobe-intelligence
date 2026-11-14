"use client";

import { useEffect } from "react";
import { dockShift, isTextEntry, staleViewportShift } from "@/lib/viewport-dock";

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
    // The tallest bottom edge this screen has shown while nobody was typing (see staleViewportShift).
    // Kept for the browser session, because coming back can load the page afresh while the viewport
    // is still stale, and a fresh page would otherwise take the shortened height as its baseline.
    const baselineKey = (width: number) => `racked:viewport-baseline:${width}`;
    const readBaseline = (width: number) => { try { return Number(window.sessionStorage.getItem(baselineKey(width))) || 0; } catch { return 0; } };
    let baselineWidth = window.innerWidth;
    let baseline = readBaseline(baselineWidth);

    function currentShift() {
      const viewport = window.visualViewport;
      return viewport ? dockShift(window.innerHeight, viewport.offsetTop, viewport.height) : 0;
    }

    function staleShift(typing: boolean) {
      if (!coarsePointer.matches) return 0;
      // Pinch-zoom shrinks the visual viewport on purpose and is dockShift's business, not this one's.
      if ((window.visualViewport?.scale ?? 1) > 1.01) return 0;
      // A new width is a new screen shape (rotation, split view): start the baseline again.
      if (window.innerWidth !== baselineWidth) { baselineWidth = window.innerWidth; baseline = readBaseline(baselineWidth); }
      if (!typing && window.innerHeight > baseline) {
        baseline = window.innerHeight;
        try { window.sessionStorage.setItem(baselineKey(baselineWidth), String(baseline)); } catch { /* storage unavailable: this page still keeps it */ }
      }
      return staleViewportShift(window.innerHeight, baseline, typing);
    }

    function measure() {
      frame = 0;
      const typingNow = coarsePointer.matches && isTextEntry(document.activeElement);
      const shift = Math.max(currentShift(), staleShift(typingNow));
      // Written only on change: scroll fires every frame and an unchanged custom property
      // should not cost a style recalculation.
      if (shift !== lastShift) {
        root.style.setProperty("--dock-shift", `${shift}px`);
        lastShift = shift;
      }
      const typing = typingNow;
      if (typing !== lastTyping) {
        if (typing) root.dataset.keyboard = "open";
        else delete root.dataset.keyboard;
        lastTyping = typing;
      }
    }

    function schedule() {
      if (!frame) frame = window.requestAnimationFrame(measure);
    }

    // Coming back to the page (another app, another tab, the Back button) is when iOS most often
    // leaves the viewport stale: measure again and ask it to re-synchronise.
    function onReturn() {
      if (document.visibilityState === "hidden") return;
      afterFocusLeaves();
    }

    function afterFocusLeaves() {
      schedule();
      window.clearTimeout(settle);
      // The keyboard animates away after focus leaves. Once it has gone, a same-position
      // scroll asks the browser to re-synchronise the viewports if they are still apart.
      settle = window.setTimeout(() => {
        if (!isTextEntry(document.activeElement) && Math.max(currentShift(), staleShift(false)) > 0) window.scrollTo(window.scrollX, window.scrollY);
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
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("pageshow", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", afterFocusLeaves);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("pageshow", onReturn);
      window.removeEventListener("focus", onReturn);
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settle);
      root.style.removeProperty("--dock-shift");
      delete root.dataset.keyboard;
    };
  }, []);
}
