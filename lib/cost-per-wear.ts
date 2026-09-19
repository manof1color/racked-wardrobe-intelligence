/**
 * Cost per wear, for a piece linked to a brand product with a listed price.
 *
 * It is one of the small, private rewards for linking a piece: the Closet shows what each wear has
 * cost, which a person cannot work out for an unlinked piece. It is said plainly to be the brand's
 * listed price, because Racked never knows what the person actually paid. Nothing here leaves the
 * person's own Closet.
 */
export function costPerWearLine(item: { listedPrice?: number | null; listedCurrency?: string | null; wearCount: number }) {
  const price = item.listedPrice;
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) return null;
  const currency = /^[A-Z]{3}$/.test(item.listedCurrency ?? "") ? item.listedCurrency! : "USD";
  const money = (value: number) => {
    try { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value); }
    catch { return `${value.toFixed(2)} ${currency}`; }
  };
  const wears = Math.max(0, Math.floor(item.wearCount));
  if (wears === 0) return `Listed at ${money(price)} · wear it to see its cost per wear`;
  return `${money(price / wears)} a wear, from the brand's listed price`;
}
