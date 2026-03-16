export const PREFERRED_POSTAL_HEADERS = ['postnummer', 'postal_code', 'postcode', 'zip'] as const

export function findPostalHeaderKey(originalFields: string[]): string | null {
  const normalized = originalFields.map((field) => field?.toLowerCase().trim() || '')
  const preferred = PREFERRED_POSTAL_HEADERS.find((candidate) => normalized.includes(candidate))
  if (!preferred) return null
  return originalFields[normalized.indexOf(preferred)] || preferred
}

export function extractValuesFromObjectRows(
  rows: Array<Record<string, unknown>>,
  key: string,
): string[] {
  return rows.map((row) => String(row[key] ?? '')).filter(Boolean)
}

export function flattenUnknownRows(rows: unknown[]): string[] {
  const values: string[] = []
  rows.forEach((row) => {
    if (Array.isArray(row)) {
      row.forEach((cell) => values.push(String(cell)))
      return
    }
    if (row && typeof row === 'object') {
      Object.values(row as Record<string, unknown>).forEach((cell) => values.push(String(cell)))
      return
    }
    if (row) values.push(String(row))
  })
  return values
}

export function flattenMatrix(matrix: Array<Array<string | number | null>>): string[] {
  const values: string[] = []
  matrix.forEach((row) => row.forEach((cell) => values.push(String(cell ?? ''))))
  return values
}
