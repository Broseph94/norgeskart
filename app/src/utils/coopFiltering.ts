import type { CoopGeoJSON } from './dataLoaders'

type CoopStoreProps = CoopGeoJSON['features'][number]['properties']

export function buildSamvirkelagMenuData(args: {
  coopStores: CoopGeoJSON | null
  isNbdStore: (props: CoopStoreProps) => boolean
  normalizeForCompare: (value: string | undefined) => string
  normalizedNbdAs: string
  normalizedNbdLabel: string
  norskButikkdriftLabel: string
  samvirkelagSearch: string
}) {
  const {
    coopStores,
    isNbdStore,
    normalizeForCompare,
    normalizedNbdAs,
    normalizedNbdLabel,
    norskButikkdriftLabel,
    samvirkelagSearch,
  } = args

  const allRegular = new Set<string>()
  const nbdChildren = new Set<string>()

  if (coopStores) {
    coopStores.features.forEach((feature) => {
      const props = feature.properties || {}
      const samvirkelag = props.samvirkelag ? String(props.samvirkelag) : ''
      if (!samvirkelag) return

      if (isNbdStore(props)) {
        const normalizedSam = normalizeForCompare(samvirkelag)
        if (normalizedSam !== normalizedNbdAs && normalizedSam !== normalizedNbdLabel) {
          nbdChildren.add(samvirkelag)
        }
        return
      }

      allRegular.add(samvirkelag)
    })
  }

  const query = samvirkelagSearch.trim().toLowerCase()
  const regularOptions = Array.from(allRegular).sort((a, b) => a.localeCompare(b, 'nb'))
  const nbdChildOptions = Array.from(nbdChildren).sort((a, b) => a.localeCompare(b, 'nb'))

  if (!query) return { regularOptions, nbdChildOptions }

  const filteredRegular = regularOptions.filter((value) => value.toLowerCase().includes(query))
  const filteredChildren = nbdChildOptions.filter((value) => value.toLowerCase().includes(query))
  const parentMatches = norskButikkdriftLabel.toLowerCase().includes(query)

  return {
    regularOptions: filteredRegular,
    nbdChildOptions: parentMatches ? nbdChildOptions : filteredChildren,
  }
}

export function buildSelectedSamvirkelagLabel(args: {
  selectedSamvirkelag: string
  nbdAllValue: string
  nbdChildPrefix: string
  norskButikkdriftLabel: string
}) {
  const { selectedSamvirkelag, nbdAllValue, nbdChildPrefix, norskButikkdriftLabel } = args
  if (selectedSamvirkelag === 'Alle') return 'Alle'
  if (selectedSamvirkelag === nbdAllValue) return norskButikkdriftLabel
  if (selectedSamvirkelag.startsWith(nbdChildPrefix)) {
    return `${norskButikkdriftLabel} / ${selectedSamvirkelag.slice(nbdChildPrefix.length)}`
  }
  return selectedSamvirkelag
}

export function getEnabledChains(
  activeChains: Record<string, boolean>,
  chainOptions: ReadonlyArray<{ id: string }>,
) {
  return chainOptions.filter((option) => activeChains[option.id]).map((option) => option.id)
}

export function filterStoresForMap(args: {
  coopStores: CoopGeoJSON | null
  enabledChains: string[]
  storeSearch: string
  matchesSelectedSamvirkelag: (props: CoopStoreProps) => boolean
}) {
  const { coopStores, enabledChains, storeSearch, matchesSelectedSamvirkelag } = args
  if (!coopStores) return []

  const searchLower = storeSearch.trim().toLowerCase()
  return coopStores.features.filter((feature) => {
    const props = feature.properties || {}
    const chain = props.chain || ''
    const name = props.name || ''
    const address = props.address || ''
    if (enabledChains.length === 0) return false
    if (!enabledChains.includes(chain)) return false
    if (!matchesSelectedSamvirkelag(props)) return false
    if (searchLower) {
      const haystack = `${name} ${address}`.toLowerCase()
      if (!haystack.includes(searchLower)) return false
    }
    return true
  })
}

export function buildStoreSuggestions(args: {
  coopStores: CoopGeoJSON | null
  enabledChains: string[]
  storeSearch: string
  matchesSelectedSamvirkelag: (props: CoopStoreProps) => boolean
}) {
  const { coopStores, enabledChains, storeSearch, matchesSelectedSamvirkelag } = args
  if (!coopStores) return []
  const query = storeSearch.trim().toLowerCase()
  if (!query) return []

  const matches = coopStores.features.filter((feature) => {
    const props = feature.properties || {}
    const chain = props.chain || ''
    const name = props.name || ''
    const address = props.address || ''
    if (enabledChains.length && !enabledChains.includes(chain)) return false
    if (!matchesSelectedSamvirkelag(props)) return false
    const samvirkelag = props.samvirkelag || ''
    const haystack = `${name} ${address} ${samvirkelag}`.toLowerCase()
    return haystack.includes(query)
  })

  return matches.slice(0, 8)
}
