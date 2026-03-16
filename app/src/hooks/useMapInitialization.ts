import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl'
import { MAP_STYLE_URL, NORWAY_CENTER, getChainLabel, type SelectionTool } from '../constants/appConfig'
import {
  loadCoopStoresGeoJSON,
  loadPostalGeoJSON,
  loadPostalLabelGeoJSON,
  loadSamvirkelagRules,
  type CoopGeoJSON,
  type PostalGeoJSON,
  type PostalLabelGeoJSON,
  type SamvirkelagRules,
} from '../utils/dataLoaders'
import { ensureCityLabelsLayer, ensureCoopSourceAndLayer, ensurePostalSourcesAndLayers, ensureSelectionLayers, getWaterLayerId } from '../utils/mapLayers'
import { normalizePostnummer } from '../utils/postnummer'
import { buildStorePopupContent } from '../utils/mapPopups'

type UseMapInitializationParams = {
  mapContainerRef: MutableRefObject<HTMLDivElement | null>
  mapRef: MutableRefObject<MapLibreMap | null>
  validPostnummerSetRef: MutableRefObject<Set<string>>
  selectionToolRef: MutableRefObject<SelectionTool>
  suppressMapClickUntilRef: MutableRefObject<number>
  isDraggingVertexRef: MutableRefObject<boolean>
  draggingVertexIndexRef: MutableRefObject<number | null>
  setPostalLoadError: Dispatch<SetStateAction<string | null>>
  setCoopLoadError: Dispatch<SetStateAction<string | null>>
  setIsLoadingPostal: Dispatch<SetStateAction<boolean>>
  setIsLoadingCoop: Dispatch<SetStateAction<boolean>>
  setPostalData: Dispatch<SetStateAction<PostalGeoJSON | null>>
  setHighlightedPostalcodes: Dispatch<SetStateAction<Set<string>>>
  setSamvirkelagRules: Dispatch<SetStateAction<SamvirkelagRules>>
  setCoopStores: Dispatch<SetStateAction<CoopGeoJSON | null>>
  setRadiusCenter: Dispatch<SetStateAction<[number, number] | null>>
  setPolygonPoints: Dispatch<SetStateAction<[number, number][]>>
  setIsPolygonDrawing: Dispatch<SetStateAction<boolean>>
}

export function useMapInitialization({
  mapContainerRef,
  mapRef,
  validPostnummerSetRef,
  selectionToolRef,
  suppressMapClickUntilRef,
  isDraggingVertexRef,
  draggingVertexIndexRef,
  setPostalLoadError,
  setCoopLoadError,
  setIsLoadingPostal,
  setIsLoadingCoop,
  setPostalData,
  setHighlightedPostalcodes,
  setSamvirkelagRules,
  setCoopStores,
  setRadiusCenter,
  setPolygonPoints,
  setIsPolygonDrawing,
}: UseMapInitializationParams) {
  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE_URL,
      center: NORWAY_CENTER,
      zoom: 4.6,
      minZoom: 3,
      maxZoom: 14,
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map

    const handleResize = () => map.resize()
    window.addEventListener('resize', handleResize)
    const styleLoadTimeout = window.setTimeout(() => {
      setPostalLoadError('Kartgrunnlag kunne ikke lastes innen rimelig tid.')
      setCoopLoadError('Butikkdata kunne ikke lastes fordi kartet ikke ble klart.')
      setIsLoadingPostal(false)
      setIsLoadingCoop(false)
    }, 15000)

    const handleMapError = (event: unknown) => {
      const maybeError = event && typeof event === 'object' ? (event as { error?: unknown }).error : null
      if (maybeError instanceof Error) {
        setPostalLoadError((prev) => prev || maybeError.message)
      }
    }
    map.on('error', handleMapError)

    map.on('load', async () => {
      window.clearTimeout(styleLoadTimeout)
      setIsLoadingPostal(true)
      setPostalLoadError(null)
      setIsLoadingCoop(true)
      setCoopLoadError(null)

      const waterLayerId = getWaterLayerId(map)

      try {
        ensureCityLabelsLayer(map, waterLayerId)

        const data = await loadPostalGeoJSON()
        setPostalData(data)
        let labelData: PostalLabelGeoJSON | null = null
        try {
          labelData = await loadPostalLabelGeoJSON()
        } catch (error) {
          // Keep fallback silent to preserve existing UI behavior.
          void error
          labelData = null
        }

        const validSet = new Set<string>()
        for (const feature of data.features ?? []) {
          const raw = feature.properties?.postnummer ?? ''
          const normalized = normalizePostnummer(String(raw))
          if (normalized) {
            validSet.add(normalized)
          }
        }
        validPostnummerSetRef.current = validSet

        ensurePostalSourcesAndLayers({
          map,
          postalData: data,
          labelData,
          waterLayerId,
        })
        ensureSelectionLayers(map)

        map.on('mouseenter', 'postal-fill', () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', 'postal-fill', () => {
          map.getCanvas().style.cursor = ''
        })

        map.on('click', 'postal-fill', (event) => {
          if (selectionToolRef.current !== 'none') return
          const feature = event.features?.[0]
          const raw = feature?.properties?.postnummer
          const normalized = raw ? normalizePostnummer(String(raw)) : null
          if (!normalized) return

          setHighlightedPostalcodes((prev) => {
            const next = new Set(prev)
            if (next.has(normalized)) {
              next.delete(normalized)
            } else {
              next.add(normalized)
            }
            return next
          })
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error loading postal data'
        setPostalLoadError(message)
      } finally {
        setIsLoadingPostal(false)
      }

      try {
        const rules = await loadSamvirkelagRules()
        setSamvirkelagRules(rules)
        const coopData = await loadCoopStoresGeoJSON()
        setCoopStores(coopData)
        ensureCoopSourceAndLayer(map, coopData)

        const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true })

        map.on('mouseenter', 'coop-pins', () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', 'coop-pins', () => {
          map.getCanvas().style.cursor = ''
        })

        map.on('click', 'coop-pins', (event) => {
          if (selectionToolRef.current !== 'none') return
          const feature = event.features?.[0]
          const props = feature?.properties || {}
          const name = props.name ? String(props.name) : 'Coop Prix'
          const address = props.address ? String(props.address) : ''
          const chain = props.chain ? String(props.chain) : ''
          const chainLabel = chain ? getChainLabel(chain) : ''
          const samvirkelag = props.samvirkelag ? String(props.samvirkelag) : ''
          const coordinates = (feature?.geometry as GeoJSON.Point | undefined)?.coordinates
          if (!coordinates) return

          popup
            .setLngLat(coordinates as [number, number])
            .setDOMContent(
              buildStorePopupContent({
                name,
                address,
                chainLabel,
                samvirkelag,
              }),
            )
            .addTo(map)
        })

        map.on('click', (event) => {
          if (Date.now() < suppressMapClickUntilRef.current) return
          if (isDraggingVertexRef.current) return
          if (selectionToolRef.current === 'radius') {
            const center: [number, number] = [event.lngLat.lng, event.lngLat.lat]
            setRadiusCenter(center)
            return
          }
          if (selectionToolRef.current === 'polygon') {
            const hitVertex = map.queryRenderedFeatures(event.point, {
              layers: ['selection-polygon-vertices'],
            })
            if (hitVertex.length > 0) return
            const point: [number, number] = [event.lngLat.lng, event.lngLat.lat]
            setPolygonPoints((prev) => [...prev, point])
            setIsPolygonDrawing(true)
          }
        })

        map.on('mouseenter', 'selection-polygon-vertices', () => {
          if (selectionToolRef.current === 'polygon') {
            map.getCanvas().style.cursor = 'move'
          }
        })
        map.on('mouseleave', 'selection-polygon-vertices', () => {
          if (!isDraggingVertexRef.current) {
            map.getCanvas().style.cursor = ''
          }
        })

        map.on('mousedown', 'selection-polygon-vertices', (event) => {
          if (selectionToolRef.current !== 'polygon') return
          const feature = event.features?.[0]
          const rawIndex = feature?.properties?.vertexIndex
          const vertexIndex = typeof rawIndex === 'number' ? rawIndex : Number(rawIndex)
          if (!Number.isFinite(vertexIndex)) return

          draggingVertexIndexRef.current = vertexIndex
          isDraggingVertexRef.current = true
          suppressMapClickUntilRef.current = Date.now() + 300
          map.dragPan.disable()
          map.getCanvas().style.cursor = 'grabbing'
        })

        map.on('mousemove', (event) => {
          if (!isDraggingVertexRef.current) return
          const index = draggingVertexIndexRef.current
          if (index == null) return
          const nextPoint: [number, number] = [event.lngLat.lng, event.lngLat.lat]
          setPolygonPoints((prev) => {
            if (index < 0 || index >= prev.length) return prev
            const next = [...prev]
            next[index] = nextPoint
            return next
          })
        })

        const stopVertexDrag = () => {
          if (!isDraggingVertexRef.current) return
          isDraggingVertexRef.current = false
          draggingVertexIndexRef.current = null
          suppressMapClickUntilRef.current = Date.now() + 150
          map.dragPan.enable()
          map.getCanvas().style.cursor = ''
        }

        map.on('mouseup', stopVertexDrag)
        map.on('mouseleave', stopVertexDrag)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Ukjent feil ved lasting av butikker'
        setCoopLoadError(message)
      } finally {
        setIsLoadingCoop(false)
      }
    })

    return () => {
      window.clearTimeout(styleLoadTimeout)
      window.removeEventListener('resize', handleResize)
      map.off('error', handleMapError)
      map.remove()
      mapRef.current = null
    }
  }, [
    draggingVertexIndexRef,
    isDraggingVertexRef,
    mapContainerRef,
    mapRef,
    selectionToolRef,
    setCoopLoadError,
    setCoopStores,
    setHighlightedPostalcodes,
    setIsLoadingCoop,
    setIsLoadingPostal,
    setIsPolygonDrawing,
    setPolygonPoints,
    setPostalData,
    setPostalLoadError,
    setRadiusCenter,
    setSamvirkelagRules,
    suppressMapClickUntilRef,
    validPostnummerSetRef,
  ])
}
