"use client";
import { useRouter } from "next/navigation";
import { backDestination } from "@/lib/back-navigation";

/** Back to the page this one was opened from, or to `fallback` when that page is not on Racked. */
export function BackButton({ fallback }: { fallback: string }) {
  const router = useRouter();
  function goBack() {
    const destination = backDestination({ referrer: document.referrer, origin: window.location.origin, historyLength: window.history.length });
    if (destination === "history") router.back();
    else router.push(fallback);
  }
  return <button type="button" className="back-button" onClick={goBack}><span aria-hidden="true">←</span>Back</button>;
}
