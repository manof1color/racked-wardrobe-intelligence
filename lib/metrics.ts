import type { Product, WardrobeItem } from "./types.ts";
import { scoreProduct } from "./matching.ts";

export function calculateBrandMetrics(product: Product, wardrobes: WardrobeItem[][]) {
  const results = wardrobes.map((items) => scoreProduct(product, items));
  const opportunity = Math.round(results.reduce((sum, result) => sum + result.score, 0) / Math.max(results.length, 1));
  const gapPrevalence = Math.round((results.filter((result) => (result.components.find((c) => c.key === "gap")?.score ?? 0) >= 70).length / Math.max(results.length, 1)) * 100);
  const duplicateRisk = Math.round((results.filter((result) => (result.components.find((c) => c.key === "duplicate")?.score ?? 100) < 50).length / Math.max(results.length, 1)) * 100);
  return { opportunity, gapPrevalence, duplicateRisk, segmentSize:wardrobes.length * 38 };
}
