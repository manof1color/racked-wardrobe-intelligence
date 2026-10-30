import type { ConsumerWorkspaceView } from "@/components/workspace-mobile-nav";

/**
 * Each wardrobe view opens with its own heading, so Today, Looks, Closet and Outfits are told apart
 * at a glance: its own words, its own colour (`.view-<name>` in globals.css), and the numbers that
 * matter on that view.
 */
export interface ViewHeading {
  eyebrow: string;
  title: string;
  accent: string;
  lede: string;
  stats: Array<{ label: string; value: string }>;
}

export function viewHeading(view: ConsumerWorkspaceView, counts: { pieces: number; outfits: number; outfitWears: number; wears: number }): ViewHeading {
  switch (view) {
    case "looks":
      return { eyebrow: "LOOKS", title: "Swipe it", accent: "together.", lede: "Pick a top, a bottom and shoes from what you own, and see the whole look before you wear it.", stats: [] };
    case "closet":
      return {
        eyebrow: "CLOSET",
        title: "Everything",
        accent: "you own.",
        lede: "Every piece, how often you actually wear it, and what each wear costs.",
        stats: [{ label: "Pieces", value: String(counts.pieces) }, { label: "Wears logged", value: String(counts.wears) }],
      };
    case "outfits":
      return {
        eyebrow: "OUTFITS",
        title: "Worth",
        accent: "repeating.",
        lede: "Wear a favourite again in one tap. Repeats are the point.",
        stats: counts.outfits ? [{ label: "Times worn", value: String(counts.outfitWears) }] : [],
      };
    case "home":
    default:
      return { eyebrow: "TODAY", title: "What are you", accent: "wearing today?", lede: "Log today's outfit to keep your streak going, or ask Hanger to pick one.", stats: [] };
  }
}
