// Product lookup against the open Open Food Facts database.

export interface Product {
  code: string;
  name: string;
  brand?: string;
  per100: { kcal: number; protein: number; carbs: number; fat: number };
  servingG?: number;
  /** Shown beside the amount, e.g. "1 plate". Only for built-in foods. */
  servingLabel?: string;
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

/** Turns a name-search response into complete products only (those with an energy value). */
export function parseSearch(body: unknown, limit = 10): Product[] {
  const list = (body as { products?: unknown } | null)?.products;
  if (!Array.isArray(list)) return [];
  const out: Product[] = [];
  for (const p of list) {
    const code = typeof (p as { code?: unknown })?.code === 'string' ? (p as { code: string }).code : '';
    const product = parseProduct(code, { status: 1, product: p });
    if (product && !product.incomplete && product.name !== 'Unnamed product') out.push(product);
    if (out.length >= limit) break;
  }
  return out;
}

/** Searches packaged products by name. Throws when offline. */
export async function searchProducts(query: string): Promise<Product[]> {
  const q = encodeURIComponent(query.trim());
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${q}&search_simple=1&action=process&json=1&page_size=20&fields=code,${FIELDS}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  return parseSearch(await res.json());
}
