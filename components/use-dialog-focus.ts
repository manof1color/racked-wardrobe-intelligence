"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex='-1'])";

/**
 * Keyboard behaviour for a modal dialog: focus moves into it when it opens, Tab and Shift+Tab
 * wrap around inside it instead of walking into the page behind the backdrop, Escape closes it,
 * and focus returns to whatever opened it. `returnFocusTo` names that control when the browser
 * may not have focused it on click (Safari does not focus buttons it clicks).
 */
export function useDialogFocus(dialog: RefObject<HTMLElement | null>, open: boolean, onClose: () => void, returnFocusTo?: RefObject<HTMLElement | null>) {
  // Read through a ref so a new onClose on every render does not re-run the effect, which would
  // pull focus back to the dialog's edge mid-typing.
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);

  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    const opener = returnFocusTo?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    if (!element.contains(document.activeElement)) element.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { close.current(); return; }
      if (event.key !== "Tab" || !element) return;
      const focusable = [...element.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((node) => node.getClientRects().length > 0);
      if (focusable.length === 0) { event.preventDefault(); element.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!element.contains(active)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (event.shiftKey && (active === first || active === element)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (opener?.isConnected) opener.focus();
    };
  }, [dialog, open, returnFocusTo]);
}
