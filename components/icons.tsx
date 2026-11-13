/**
 * One small set of line icons, drawn on a 24px grid with the same stroke, so navigation looks the
 * same on every device. The tabs used text symbols (⌂ ◇ ▦ ◫ ◎) before, which each phone drew in a
 * different font, at a different weight and size. Icons are always decorative here: the label
 * next to each one carries the meaning, so every icon is hidden from assistive technology.
 */
export type IconName = "today" | "overview" | "looks" | "closet" | "catalog" | "outfits" | "community" | "add" | "hanger" | "camera" | "image";

const paths: Record<IconName, React.ReactNode> = {
  today: <><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></>,
  overview: <><rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><rect x="13.5" y="13.5" width="7" height="7" rx="1"/></>,
  looks: <path d="M12 3l1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8z"/>,
  closet: <path d="M8.5 3.5 4 6.5l2 4 2-1v11h8v-11l2 1 2-4-4.5-3c-.8 1.6-2 2.4-3.5 2.4s-2.7-.8-3.5-2.4z"/>,
  catalog: <><path d="M3.5 12V3.5H12l8.5 8.5-8.5 8.5z"/><circle cx="8" cy="8" r="1.5"/></>,
  outfits: <path d="M12 3.5 20.5 8 12 12.5 3.5 8zM3.5 12 12 16.5 20.5 12M3.5 16 12 20.5 20.5 16"/>,
  community: <><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15.5 4.9a3.2 3.2 0 0 1 0 6.2M17.5 14.4c2 .8 3.5 2.9 3.5 5.6"/></>,
  add: <path d="M12 5v14M5 12h14"/>,
  hanger: <path d="M10 6a2 2 0 1 1 2.8 1.8c-.5.2-.8.7-.8 1.2v1L3.6 17.1a1 1 0 0 0 .6 1.9h15.6a1 1 0 0 0 .6-1.9L12 10"/>,
  image: <><rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><circle cx="9" cy="10" r="1.6"/><path d="m20.5 16-5-5-8.5 8.5"/></>,
  camera: <><path d="M4 8h3.2l1.8-2.5h6L16.8 8H20v11H4z"/><circle cx="12" cy="13.3" r="3.3"/></>,
};

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return <svg className={className ? `icon ${className}` : "icon"} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
