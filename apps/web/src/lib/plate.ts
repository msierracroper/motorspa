/** Formato visual de placa de moto colombiana: ABC12D → "ABC 12D". */
export function formatPlate(plate: string): string {
  const p = plate.replace(/\s+/g, '').toUpperCase();
  return p.length === 6 ? `${p.slice(0, 3)} ${p.slice(3)}` : p;
}
