// Deterministic, deliberately illustrated demo art: no photos or external assets.
const PAPER = "#f3efe5";
const INK = "#252c30";
const COLORS = {
  black: "#30343a", charcoal: "#4a5155", gray: "#707777", grey: "#707777",
  navy: "#344b63", blue: "#5477a0", indigo: "#405a83", olive: "#667154",
  green: "#6f886c", brown: "#79563f", tan: "#ae8560", sand: "#c7ad83",
  beige: "#c7ad83", cream: "#e9ddc4", white: "#f8f8f2", red: "#a74f4b",
  pink: "#cb898f", purple: "#75618b", gold: "#b69a58", silver: "#a2a9aa",
  "#394a63": "#394a63", "#292929": "#383d40", "#574b70": "#685b81",
};

function xml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
  })[character]);
}
function text(value, length = 42) {
  const cleaned = String(value ?? "").trim();
  return xml(cleaned.length > length ? `${cleaned.slice(0, length - 1)}…` : cleaned);
}
function fillFor(color) { return COLORS[String(color ?? "").trim().toLowerCase()] ?? "#747b77"; }

const OUTLINES = {
  top: "M340 255 410 220 490 220 560 255 665 275 738 433 661 468 610 375 610 750 290 750 290 375 239 468 162 433 235 275Z",
  pants: "M280 215H620L593 790H490L453 495H447L410 790H307Z",
  shorts: "M280 225H620L603 505H485L450 420L415 505H297Z",
  skirt: "M337 225H563L675 735H225Z",
  outerwear: "M325 240 409 205 491 205 575 240 672 272 756 510 672 543 612 380 604 780H296L288 380 228 543 144 510 228 272Z",
  sneaker: "M170 570 276 544 346 472 440 475 503 543 679 583 739 626 739 687 198 687Q157 679 158 641Z",
  boot: "M263 290H462L479 534 571 577 716 599 743 643 743 704H176V646Q192 599 263 580Z",
  dressShoe: "M152 598 266 586 333 544 493 548 606 603 742 616 747 678H150Z",
  dress: "M370 225 418 203H482L530 225 644 300 706 420 639 453 576 365 548 480 681 795H219L352 480 324 365 261 453 194 420 256 300Z",
  bag: "M247 395H653L683 738Q683 775 648 775H252Q217 775 217 738Z",
  ring: "M450 254C577 254 670 347 670 474C670 601 577 694 450 694C323 694 230 601 230 474C230 347 323 254 450 254ZM450 351C376 351 327 400 327 474C327 548 376 597 450 597C524 597 573 548 573 474C573 400 524 351 450 351Z",
  necklace: "M244 273Q256 564 450 622Q644 564 656 273L612 273Q597 494 450 553Q303 494 288 273Z",
  hat: "M255 515Q268 302 450 302Q632 302 645 515Z",
  belt: "M180 438H718V554H180Z",
  scarf: "M287 239Q446 183 587 272L537 365Q438 306 362 357L332 734H220L252 385Z",
  unknown: "M293 294 384 253H516L607 294 680 462 602 496 565 416 565 735H335V416L298 496 220 462Z",
};
const DETAILS = {
  top: "M410 220Q450 289 490 220M290 338V735M610 338V735",
  pants: "M283 270H617M450 270V490M348 305H393M507 305H552",
  shorts: "M285 276H615M450 278V419",
  skirt: "M335 273H565M450 274V704",
  outerwear: "M409 205 450 354 491 205M450 354V768M333 283 402 387 450 354M567 283 498 387 450 354M485 455H555",
  sneaker: "M210 622 328 579 449 582M158 664H738M365 510 411 533M385 493 433 519",
  boot: "M263 339H459M262 439H466M177 656H741M323 320V545",
  dressShoe: "M277 586Q416 602 506 565M151 658H746M415 574L445 590",
  dress: "M418 203Q450 278 482 203M350 482H550M450 482V778",
  bag: "M335 395V340Q335 242 450 242Q565 242 565 340V395M248 453H652M450 451V744",
  ring: "M365 282 398 226H502L535 282",
  necklace: "M450 621V720M405 720H495",
  hat: "M160 514Q450 568 740 514M160 514H740M323 397H577",
  belt: "M232 438V554M300 438V554M349 473H386V519H349Z",
  scarf: "M334 580 485 650M249 690H327",
  unknown: "M384 253Q450 315 516 253M335 390V713M565 390V713",
};
const BACK_DETAILS = {
  top: "M340 360H560M450 360V720", pants: "M310 280H590M450 280V480",
  shorts: "M310 280H590M450 280V430", skirt: "M350 275H550M450 275V700",
  outerwear: "M350 320H550M450 320V760", dress: "M360 320H540M450 320V750",
};

function silhouetteKey(category, subtype) {
  const kind = String(category ?? "unknown").toLowerCase();
  const type = String(subtype ?? "").toLowerCase();
  if (kind === "bottom") return type === "shorts" ? "shorts" : type === "skirt" ? "skirt" : "pants";
  if (kind === "shoe") return /boot/.test(type) ? "boot" : /dress-shoe|oxford|derb|loafer/.test(type) ? "dressShoe" : "sneaker";
  if (kind === "jewelry") return type === "necklace" ? "necklace" : "ring";
  if (kind === "accessory") return type === "belt" ? "belt" : type === "scarf" ? "scarf" : "hat";
  return Object.hasOwn(OUTLINES, kind) ? kind : "unknown";
}
function garmentShape(category, subtype, color, view = "front") {
  const key = silhouetteKey(category, subtype);
  const details = view === "back" ? (BACK_DETAILS[key] ?? DETAILS[key]) : DETAILS[key];
  return `<g data-category-silhouette="${key}" stroke="${INK}" stroke-linejoin="round" stroke-linecap="round"><path data-garment-outline="${key}" d="${OUTLINES[key]}" fill="${fillFor(color)}" fill-rule="${key === "ring" ? "evenodd" : "nonzero"}" stroke-width="11"/><path d="${details}" fill="none" stroke-width="9"/></g>`;
}
function frame({ title, subtitle, color, body, badge }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1100" viewBox="0 0 900 1100" role="img"><rect width="900" height="1100" fill="${PAPER}"/><rect x="53" y="48" width="794" height="1004" rx="30" fill="none" stroke="#d9d2c5" stroke-width="4"/><text x="450" y="135" text-anchor="middle" font-family="Arial,sans-serif" font-size="36" font-weight="700" fill="${INK}">${text(title)}</text><text x="450" y="188" text-anchor="middle" font-family="Arial,sans-serif" font-size="26" fill="#515853">${text(subtitle)}</text>${body}<rect x="105" y="874" width="690" height="115" rx="18" fill="${INK}"/><text x="450" y="924" text-anchor="middle" font-family="Arial,sans-serif" font-size="30" font-weight="800" fill="#f9f4e8">SYNTHETIC DEMO</text><text x="450" y="963" text-anchor="middle" font-family="Arial,sans-serif" font-size="23" fill="#d6e1cf">${text(badge, 54)}</text><circle cx="450" cy="813" r="12" fill="${color}" stroke="${INK}" stroke-width="3"/></svg>`;
}

export function garmentArt({ name, category, subtype, color, brand } = {}) {
  return frame({ title: name || "Unidentified garment", subtitle: brand || `${category || "unknown"} · ${subtype || "illustration"}`, color: fillFor(color), body: garmentShape(category, subtype, color), badge: "WARDROBE ILLUSTRATION" });
}

export function productArt({ name, sku, brand, category, subtype, color, view = "front" } = {}) {
  if (!["front", "back", "label"].includes(view)) throw new Error("Product art view must be front, back, or label.");
  const label = view === "label";
  const body = label
    ? `<rect x="186" y="272" width="528" height="475" rx="27" fill="#fffdf7" stroke="${INK}" stroke-width="9"/><circle cx="450" cy="320" r="19" fill="${PAPER}" stroke="${INK}" stroke-width="7"/><text x="450" y="433" text-anchor="middle" font-family="Arial,sans-serif" font-size="31" font-weight="700" fill="${INK}">${text(brand || "Fictional brand", 32)}</text><text x="450" y="515" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" fill="${INK}">${text(name || "Product", 32)}</text><path d="M260 560H640" stroke="${INK}" stroke-width="4"/><text x="450" y="632" text-anchor="middle" font-family="Arial,sans-serif" font-size="43" font-weight="700" fill="${INK}">${text(sku || "NO SKU", 24)}</text><text x="450" y="697" text-anchor="middle" font-family="Arial,sans-serif" font-size="22" fill="#515853">ILLUSTRATED PRODUCT LABEL</text>`
    : garmentShape(category, subtype, color, view);
  return frame({ title: label ? brand || "Fictional brand" : name || "Product", subtitle: label ? "Product label · synthetic" : `${brand || "Fictional brand"} · ${sku || "NO SKU"}`, color: fillFor(color), body, badge: `PRODUCT ${view.toUpperCase()} · ${sku || "NO SKU"}` });
}
