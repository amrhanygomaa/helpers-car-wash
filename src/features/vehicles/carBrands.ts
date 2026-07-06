/** Car brands common in the Egyptian market — Arabic label + English name for search. */
export interface CarBrand {
  ar: string;
  en: string;
  /** File name (no extension) in src/assets/car-logos/ — undefined = no logo available. */
  logo?: string;
}

export const CAR_BRANDS: CarBrand[] = [
  { ar: "ألفا روميو", en: "Alfa Romeo", logo: "alfa-romeo" },
  { ar: "أوبل", en: "Opel", logo: "opel" },
  { ar: "أودي", en: "Audi", logo: "audi" },
  { ar: "إم جي", en: "MG", logo: "mg" },
  { ar: "إنفينيتي", en: "Infiniti", logo: "infiniti" },
  { ar: "إيسوزو", en: "Isuzu", logo: "isuzu" },
  { ar: "بايك", en: "BAIC", logo: "baic-motor" },
  { ar: "بروتون", en: "Proton", logo: "proton" },
  { ar: "بورشه", en: "Porsche", logo: "porsche" },
  { ar: "بي إم دبليو", en: "BMW", logo: "bmw" },
  { ar: "بي واي دي", en: "BYD", logo: "byd" },
  { ar: "بيجو", en: "Peugeot", logo: "peugeot" },
  { ar: "تاتا", en: "Tata", logo: "tata" },
  { ar: "تويوتا", en: "Toyota", logo: "toyota" },
  { ar: "جاك", en: "JAC", logo: "jac" },
  { ar: "جاغوار", en: "Jaguar", logo: "jaguar" },
  { ar: "جريت وول", en: "Great Wall", logo: "great-wall" },
  { ar: "جي إم سي", en: "GMC", logo: "gmc" },
  { ar: "جي إيه سي", en: "GAC", logo: "gac-group" },
  { ar: "جيب", en: "Jeep", logo: "jeep" },
  { ar: "جيلي", en: "Geely", logo: "geely" },
  { ar: "دايهاتسو", en: "Daihatsu", logo: "daihatsu" },
  { ar: "دودج", en: "Dodge", logo: "dodge" },
  { ar: "دونج فينج", en: "Dongfeng", logo: "dongfeng" },
  { ar: "دي إف إس كي", en: "DFSK" },
  { ar: "رينو", en: "Renault", logo: "renault" },
  { ar: "سانج يونج", en: "SsangYong", logo: "ssangyong" },
  { ar: "سبيرانزا", en: "Speranza" },
  { ar: "سكودا", en: "Skoda", logo: "skoda" },
  { ar: "سوبارو", en: "Subaru", logo: "subaru" },
  { ar: "سوزوكي", en: "Suzuki", logo: "suzuki" },
  { ar: "سيات", en: "Seat", logo: "seat" },
  { ar: "سيتروين", en: "Citroen", logo: "citroen" },
  { ar: "شانجان", en: "Changan", logo: "changan" },
  { ar: "شيري", en: "Chery", logo: "chery" },
  { ar: "شيفروليه", en: "Chevrolet", logo: "chevrolet" },
  { ar: "فورد", en: "Ford", logo: "ford" },
  { ar: "فولفو", en: "Volvo", logo: "volvo" },
  { ar: "فولكس فاجن", en: "Volkswagen", logo: "volkswagen" },
  { ar: "فيات", en: "Fiat", logo: "fiat" },
  { ar: "كاديلاك", en: "Cadillac", logo: "cadillac" },
  { ar: "كيا", en: "Kia", logo: "kia" },
  { ar: "لادا", en: "Lada", logo: "lada" },
  { ar: "لاند روفر", en: "Land Rover", logo: "land-rover" },
  { ar: "ليكزس", en: "Lexus", logo: "lexus" },
  { ar: "مازدا", en: "Mazda", logo: "mazda" },
  { ar: "ماهيندرا", en: "Mahindra", logo: "mahindra" },
  { ar: "مرسيدس", en: "Mercedes-Benz", logo: "mercedes-benz" },
  { ar: "ميتسوبيشي", en: "Mitsubishi", logo: "mitsubishi" },
  { ar: "ميني", en: "Mini", logo: "mini" },
  { ar: "نيسان", en: "Nissan", logo: "nissan" },
  { ar: "هافال", en: "Haval", logo: "haval" },
  { ar: "هوندا", en: "Honda", logo: "honda" },
  { ar: "هيونداي", en: "Hyundai", logo: "hyundai" },
].sort((a, b) => a.ar.localeCompare(b.ar, "ar"));

/**
 * Bundled logo images (offline — packaged with the app at build time).
 * Maps "slug" → resolved asset URL.
 */
const logoModules = import.meta.glob<string>("../../assets/car-logos/*.png", {
  eager: true,
  import: "default",
});
export const BRAND_LOGOS: Record<string, string> = Object.fromEntries(
  Object.entries(logoModules).map(([path, url]) => [
    path.replace(/^.*\/([^/]+)\.png$/, "$1"),
    url,
  ])
);

/** Normalize Arabic/English text for loose matching (أ/إ/آ → ا, ى → ي, ة → ه). */
export function normalizeBrandQuery(s: string): string {
  return s
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

export function filterBrands(query: string): CarBrand[] {
  const q = normalizeBrandQuery(query);
  if (!q) return CAR_BRANDS;
  return CAR_BRANDS.filter(
    (b) => normalizeBrandQuery(b.ar).includes(q) || b.en.toLowerCase().includes(q)
  );
}
