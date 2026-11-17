// Product lookup against the open Open Food Facts database.

export interface Product {
  code: string;
  name: string;
  brand?: string;
  per100: { kcal: number; protein: number; carbs: number; fat: number };
  servingG?: number;
  /** True when the database has the product but no energy value for it. */
  incomplete: boolean;
}

const FIELDS = 'product_name,brands,nutriments,serving_quantity';

export function isBarcode(text: string): boolean {
  return /^\d{8,14}$/.test(text.trim());
}

function num(x: unknown): number | undefined {
  const n = typeof x === 'string' ? Number(x) : x;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

/** Turns an API response into a Product; null when the code is unknown. */
export function parseProduct(code: string, body: unknown): Product | null {
  const b = body as { status?: number; product?: Record<string, unknown> } | null;
  if (!b || b.status !== 1 || !b.product) return null;
  const p = b.product;
  const n = (p.nutriments ?? {}) as Record<string, unknown>;
  const kj = num(n['energy_100g']);
  const kcal = num(n['energy-kcal_100g']) ?? (kj !== undefined ? kj / 4.184 : undefined);
  const name = typeof p.product_name === 'string' && p.product_name.trim() ? p.product_name.trim() : 'Unnamed product';
  const brand = typeof p.brands === 'string' && p.brands.trim() ? p.brands.split(',')[0].trim() : undefined;
  const serving = num(p.serving_quantity);
  return {
    code,
    name,
    brand,
    per100: {
      kcal: Math.round(kcal ?? 0),
      protein: num(n['proteins_100g']) ?? 0,
      carbs: num(n['carbohydrates_100g']) ?? 0,
      fat: num(n['fat_100g']) ?? 0,
    },
    servingG: serving && serving > 0 ? serving : undefined,
    incomplete: kcal === undefined,
  };
}

/** Looks a barcode up. Returns null when unknown; throws when offline. */
export async function lookupBarcode(code: string): Promise<Product | null> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
  return parseProduct(code, await res.json());
}
