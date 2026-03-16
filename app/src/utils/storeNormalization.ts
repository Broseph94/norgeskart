export function normalizeForCompare(value: string | undefined) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('nb-NO')
}

function stripDiacritics(value: string) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function canonicalizeStoreName(value: string | undefined) {
  let next = normalizeForCompare(value)
  next = next.replace(/,\s*nbd[a-z0-9]*$/i, '')
  next = stripDiacritics(next)
  next = next
    .replace(/\bcoop\s+extra\b/g, 'extra')
    .replace(/\bcoop\s+mega\b/g, 'mega')
    .replace(/\bcoop\s+prix\b/g, 'prix')
    .replace(/\bcoop\s+obs\s+bygg\b/g, 'obs bygg')
    .replace(/\bcoop\s+obs\b/g, 'obs')
  next = next.replace(/[.,/\\-]/g, ' ')
  return next.replace(/\s+/g, ' ').trim()
}
