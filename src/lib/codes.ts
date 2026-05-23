export function formatSupplierCode(n: number): string {
  return `SUP-${String(n).padStart(4, "0")}`;
}
