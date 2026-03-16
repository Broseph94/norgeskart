function normalizeForCompare(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('nb-NO')
}

function stripDiacritics(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
}

function canonicalizeStoreName(value) {
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

function inferChainFromName(value) {
  const canonical = canonicalizeStoreName(value)
  if (canonical.startsWith('extra ')) return 'extra'
  if (canonical.startsWith('mega ')) return 'mega'
  if (canonical.startsWith('prix ')) return 'prix'
  if (canonical.startsWith('obs bygg ')) return 'obsbygg'
  if (canonical.startsWith('obs ')) return 'obs'
  return ''
}

function extractZipFromAddress(value) {
  const match = String(value || '').match(/\b(\d{4})\b/)
  return match ? match[1] : ''
}

function canonicalizeAddress(value) {
  let next = normalizeForCompare(value)
  next = stripDiacritics(next)
  next = next
    .replace(/\bgt\.\b/g, 'gate')
    .replace(/\bgt\b/g, 'gate')
    .replace(/\bvn\.\b/g, 'veien')
    .replace(/\bvn\b/g, 'veien')
  next = next.replace(/[.,/\\-]/g, ' ')
  return next.replace(/\s+/g, ' ').trim()
}

function addressTokens(value) {
  return canonicalizeAddress(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && /[a-z0-9]/.test(token))
}

function normalizeChainId(raw) {
  const value = String(raw || '').toLowerCase()
  if (value.includes('prix')) return 'prix'
  if (value.includes('extra')) return 'extra'
  if (value.includes('mega')) return 'mega'
  if (value.includes('obs bygg') || value.includes('bygg')) return 'obsbygg'
  if (value.includes('obs')) return 'obs'
  return ''
}

module.exports = {
  normalizeForCompare,
  stripDiacritics,
  canonicalizeStoreName,
  inferChainFromName,
  extractZipFromAddress,
  canonicalizeAddress,
  addressTokens,
  normalizeChainId,
}
