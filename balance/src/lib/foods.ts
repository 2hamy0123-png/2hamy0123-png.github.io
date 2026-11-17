// Common foods that are weak or missing in barcode databases, with typical
// values for home cooking. Values are approximate and the app says so.

export interface Per100 {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface CommonFood {
  name: string;
  /** Arabic name, used for searching. */
  ar: string;
  per100: Per100;
  servingG: number;
  servingLabel: string;
}

const f = (name: string, ar: string, kcal: number, protein: number, carbs: number, fat: number, servingG: number, servingLabel: string): CommonFood => ({
  name,
  ar,
  per100: { kcal, protein, carbs, fat },
  servingG,
  servingLabel,
});

export const COMMON_FOODS: CommonFood[] = [
  f('Koshari', 'كشري', 150, 4.5, 26, 3, 350, '1 plate'),
  f('Ful medames', 'فول مدمس', 120, 7, 15, 3, 200, '1 bowl'),
  f('Taamiya (falafel)', 'طعمية فلافل', 333, 13, 32, 18, 85, '5 pieces'),
  f('Baladi bread', 'عيش بلدي', 250, 9, 50, 1.5, 90, '1 loaf'),
  f('Pita bread', 'عيش شامي', 275, 9, 56, 1.2, 60, '1 piece'),
  f('Toast bread', 'توست', 265, 9, 49, 3.2, 28, '1 slice'),
  f('White rice, cooked', 'رز ابيض ارز', 130, 2.7, 28, 0.3, 150, '1 serving'),
  f('Rice with vermicelli', 'رز بالشعرية ارز', 170, 3, 31, 3.5, 150, '1 serving'),
  f('Molokhia', 'ملوخية', 50, 4, 5, 1.5, 200, '1 bowl'),
  f('Okra stew (bamia)', 'بامية', 70, 2, 8, 3.5, 250, '1 bowl'),
  f('Stuffed vine leaves (mahshi)', 'محشي ورق عنب', 150, 3, 22, 6, 150, '1 serving'),
  f('Macaroni béchamel', 'مكرونة بشاميل', 190, 7, 22, 8, 250, '1 piece'),
  f('Lentil soup', 'شوربة عدس', 70, 4.5, 11, 1, 250, '1 bowl'),
  f('Chickpeas, boiled', 'حمص مسلوق', 164, 8.9, 27, 2.6, 100, '1 serving'),
  f('Hummus', 'حمص بالطحينة', 166, 8, 14, 10, 60, '1 serving'),
  f('Tahini', 'طحينة', 595, 17, 21, 54, 15, '1 tbsp'),
  f('Grilled chicken breast', 'فراخ مشوية صدر', 165, 31, 0, 3.6, 150, '1 breast'),
  f('Chicken shawarma sandwich', 'شاورما فراخ', 200, 12, 18, 9, 250, '1 sandwich'),
  f('Kofta, grilled', 'كفتة مشوية', 250, 17, 3, 19, 120, '4 pieces'),
  f('Beef steak, grilled', 'استيك لحم بقري', 250, 26, 0, 15, 120, '1 serving'),
  f('Grilled fish', 'سمك مشوي', 128, 26, 0, 2.7, 150, '1 fillet'),
  f('Tuna, canned in water', 'تونة', 116, 26, 0, 1, 100, '1 serving'),
  f('Egg, boiled', 'بيض مسلوق بيضة', 155, 13, 1.1, 11, 50, '1 egg'),
  f('Egg, fried', 'بيض مقلي بيضة', 196, 13.6, 0.8, 15, 46, '1 egg'),
  f('White cheese (feta)', 'جبنة بيضاء فيتا', 264, 14, 4, 21, 40, '1 serving'),
  f('Yogurt, plain', 'زبادي', 61, 3.5, 4.7, 3.3, 170, '1 cup'),
  f('Milk, whole', 'لبن حليب', 61, 3.2, 4.8, 3.3, 240, '1 glass'),
  f('Rolled oats, dry', 'شوفان', 379, 13, 68, 6.5, 40, '1 serving'),
  f('Banana', 'موز', 89, 1.1, 23, 0.3, 118, '1 medium'),
  f('Apple', 'تفاح', 52, 0.3, 14, 0.2, 180, '1 medium'),
  f('Orange', 'برتقال', 47, 0.9, 12, 0.1, 130, '1 medium'),
  f('Dates', 'تمر بلح', 282, 2.5, 75, 0.4, 24, '3 dates'),
  f('Tomato', 'طماطم', 18, 0.9, 3.9, 0.2, 120, '1 medium'),
  f('Cucumber', 'خيار', 15, 0.7, 3.6, 0.1, 100, '1 medium'),
  f('Tomato and cucumber salad', 'سلطة خضار', 20, 0.9, 4, 0.2, 150, '1 plate'),
  f('Boiled potato', 'بطاطس مسلوقة', 87, 1.9, 20, 0.1, 150, '1 medium'),
  f('Sweet potato, baked', 'بطاطا', 90, 2, 21, 0.2, 150, '1 medium'),
  f('French fries', 'بطاطس مقلية', 312, 3.4, 41, 15, 120, '1 serving'),
  f('Olive oil', 'زيت زيتون', 884, 0, 0, 100, 14, '1 tbsp'),
  f('Honey', 'عسل', 304, 0.3, 82, 0, 21, '1 tbsp'),
  f('Sugar', 'سكر', 387, 0, 100, 0, 4, '1 tsp'),
  f('Peanut butter', 'زبدة فول سوداني', 588, 25, 20, 50, 32, '2 tbsp'),
  f('Almonds', 'لوز', 579, 21, 22, 50, 28, '1 handful'),
  f('Basbousa', 'بسبوسة', 380, 4, 55, 15, 80, '1 piece'),
];

/** Lower-cases and unifies Arabic letter variants so searches match either spelling. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .trim();
}

/** Foods whose English or Arabic name contains every word typed; name matches first. */
export function searchFoods(query: string, limit = 8): CommonFood[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const scored: { food: CommonFood; rank: number }[] = [];
  for (const food of COMMON_FOODS) {
    const en = normalize(food.name);
    const hay = `${en} ${normalize(food.ar)}`;
    if (!words.every((w) => hay.includes(w))) continue;
    scored.push({ food, rank: en.startsWith(words[0]) ? 0 : 1 });
  }
  return scored.sort((a, b) => a.rank - b.rank).slice(0, limit).map((s) => s.food);
}
