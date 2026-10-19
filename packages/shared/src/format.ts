/** Formatos de Colombia: pesos y placas. */

/** 12000 → "$12.000" (pesos enteros, separador de miles con punto). */
export function formatCOP(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const digits = Math.abs(Math.round(amount))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}$${digits}`;
}

/** Normaliza una placa: mayúsculas, sin espacios ni guiones. */
export function normalizePlate(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Formato de placa de moto colombiana: ABC12D. Se aceptan otros formatos (SPEC §4.1). */
export function isColombianMotoPlate(plate: string): boolean {
  return /^[A-Z]{3}\d{2}[A-Z]$/.test(normalizePlate(plate));
}

/** Placa válida para el sistema: 4 a 8 caracteres alfanuméricos. */
export function isValidPlate(plate: string): boolean {
  return /^[A-Z0-9]{4,8}$/.test(normalizePlate(plate));
}
