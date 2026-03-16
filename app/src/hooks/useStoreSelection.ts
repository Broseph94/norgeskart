import { useCallback, type MutableRefObject } from 'react'
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl'
import type { CoopGeoJSON } from '../utils/dataLoaders'
import { buildStorePopupContent } from '../utils/mapPopups'
import { getChainLabel } from '../constants/appConfig'

type UseStoreSelectionParams = {
  mapRef: MutableRefObject<MapLibreMap | null>
}

type UseStoreSelectionResult = {
  handleSelectStore: (feature: CoopGeoJSON['features'][number]) => void
}

export function useStoreSelection({ mapRef }: UseStoreSelectionParams): UseStoreSelectionResult {
  const handleSelectStore = useCallback((feature: CoopGeoJSON['features'][number]) => {
    const map = mapRef.current
    if (!map || feature.geometry.type !== 'Point') return
    const coords = feature.geometry.coordinates as [number, number]
    const props = feature.properties || {}
    const name = props.name ? String(props.name) : 'Butikk'
    const address = props.address ? String(props.address) : ''
    const chain = props.chain ? String(props.chain) : ''
    const samvirkelag = props.samvirkelag ? String(props.samvirkelag) : ''

    map.flyTo({ center: coords, zoom: 14, speed: 1.2 })
    new maplibregl.Popup({ closeButton: true, closeOnClick: true })
      .setLngLat(coords)
      .setDOMContent(
        buildStorePopupContent({
          name,
          address,
          chainLabel: chain ? getChainLabel(chain) : '',
          samvirkelag,
        }),
      )
      .addTo(map)
  }, [mapRef])

  return { handleSelectStore }
}
