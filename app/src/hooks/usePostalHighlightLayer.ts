import { useEffect, type MutableRefObject } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'

type UsePostalHighlightLayerParams = {
  mapRef: MutableRefObject<MapLibreMap | null>
  highlightedPostalcodes: Set<string>
}

export function usePostalHighlightLayer({
  mapRef,
  highlightedPostalcodes,
}: UsePostalHighlightLayerParams) {
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer('postal-highlight')) return

    const values = Array.from(highlightedPostalcodes)
    map.setFilter('postal-highlight', ['in', ['get', 'postnummer'], ['literal', values]])
  }, [mapRef, highlightedPostalcodes])
}
