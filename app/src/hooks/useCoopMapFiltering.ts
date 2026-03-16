import { useEffect, useMemo, useState, type MutableRefObject } from 'react'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import { CHAIN_OPTIONS } from '../constants/appConfig'
import { buildStoreSuggestions, filterStoresForMap, getEnabledChains } from '../utils/coopFiltering'
import type { CoopGeoJSON } from '../utils/dataLoaders'

type CoopStoreProps = CoopGeoJSON['features'][number]['properties']

type UseCoopMapFilteringParams = {
  mapRef: MutableRefObject<MapLibreMap | null>
  coopStores: CoopGeoJSON | null
  storeSearch: string
  matchesSelectedSamvirkelag: (props: CoopStoreProps) => boolean
}

type UseCoopMapFilteringResult = {
  activeChains: Record<string, boolean>
  handleChainToggle: (chainId: string) => void
  storeSuggestions: CoopGeoJSON['features']
}

export function useCoopMapFiltering({
  mapRef,
  coopStores,
  storeSearch,
  matchesSelectedSamvirkelag,
}: UseCoopMapFilteringParams): UseCoopMapFilteringResult {
  const [activeChains, setActiveChains] = useState<Record<string, boolean>>(() =>
    CHAIN_OPTIONS.reduce<Record<string, boolean>>((acc, option) => {
      acc[option.id] = true
      return acc
    }, {}),
  )

  const enabledChains = useMemo(
    () => getEnabledChains(activeChains, CHAIN_OPTIONS),
    [activeChains],
  )

  const handleChainToggle = (chainId: string) => {
    setActiveChains((prev) => ({
      ...prev,
      [chainId]: !prev[chainId],
    }))
  }

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer('coop-pins')) return
    const filtered = filterStoresForMap({
      coopStores,
      enabledChains,
      storeSearch,
      matchesSelectedSamvirkelag,
    })

    const source = map.getSource('coopPrixStores')
    if (source && 'setData' in source) {
      ;(source as GeoJSONSource).setData({ type: 'FeatureCollection', features: filtered })
    }
  }, [mapRef, coopStores, enabledChains, matchesSelectedSamvirkelag, storeSearch])

  const storeSuggestions = useMemo(
    () =>
      buildStoreSuggestions({
        coopStores,
        enabledChains,
        storeSearch,
        matchesSelectedSamvirkelag,
      }),
    [coopStores, enabledChains, matchesSelectedSamvirkelag, storeSearch],
  )

  return { activeChains, handleChainToggle, storeSuggestions }
}
