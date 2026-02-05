export function normalizePostnummer(value: string): string | null {
  const digitsOnly = value.replace(/\D/g, '')
  if (digitsOnly.length !== 4) return null
  return digitsOnly
}
