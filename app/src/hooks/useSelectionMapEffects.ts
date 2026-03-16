import { useEffect, type MutableRefObject } from 'react'
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import { featureCollection, point as turfPoint } from '@turf/turf'
import type { SelectionTool } from '../constants/appConfig'
import { buildDrawPolygon, buildRadiusGeometry } from '../utils/selectionGeometry'

type UseSelectionMapEffectsParams = {
  mapRef: MutableRefObject<MapLibreMap | null>
  selectionTool: SelectionTool
  selectionToolRef: MutableRefObject<SelectionTool>
  radiusCenter: [number, number] | null
  radiusCenterRef: MutableRefObject<[number, number] | null>
  radiusMeters: number
  polygonPoints: [number, number][]
  polygonPointsRef: MutableRefObject<[number, number][]>
}

export function useSelectionMapEffects({
  mapRef,
  selectionTool,
  selectionToolRef,
  radiusCenter,
  radiusCenterRef,
  radiusMeters,
  polygonPoints,
  polygonPointsRef,
}: UseSelectionMapEffectsParams) {
  useEffect(() => {
    selectionToolRef.current = selectionTool
  }, [selectionTool, selectionToolRef])

  useEffect(() => {
    radiusCenterRef.current = radiusCenter
  }, [radiusCenter, radiusCenterRef])

  useEffect(() => {
    polygonPointsRef.current = polygonPoints
  }, [polygonPoints, polygonPointsRef])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (selectionTool === 'polygon') {
      map.doubleClickZoom.disable()
      return
    }
    map.doubleClickZoom.enable()
  }, [mapRef, selectionTool])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const source = map.getSource('selection-radius')
    if (!source || !('setData' in source)) return
    if (selectionTool === 'radius' && radiusCenter) {
      const geometry = buildRadiusGeometry(radiusCenter, radiusMeters)
      ;(source as GeoJSONSource).setData(featureCollection([geometry]))
    } else {
      ;(source as GeoJSONSource).setData(featureCollection([]))
    }
  }, [mapRef, selectionTool, radiusCenter, radiusMeters])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const source = map.getSource('selection-radius-center')
    if (!source || !('setData' in source)) return
    if (selectionTool === 'radius' && radiusCenter) {
      ;(source as GeoJSONSource).setData(featureCollection([turfPoint(radiusCenter)]))
    } else {
      ;(source as GeoJSONSource).setData(featureCollection([]))
    }
  }, [mapRef, selectionTool, radiusCenter])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const polygonSource = map.getSource('selection-polygon')
    const verticesSource = map.getSource('selection-polygon-vertices')
    const lineSource = map.getSource('selection-polygon-line')
    if (!polygonSource || !verticesSource || !lineSource) return
    if (!('setData' in polygonSource) || !('setData' in verticesSource) || !('setData' in lineSource)) return

    if (selectionTool === 'polygon') {
      if (polygonPoints.length > 0) {
        ;(verticesSource as GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: polygonPoints.map((coords, vertexIndex) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: coords },
            properties: { vertexIndex },
          })),
        })
      } else {
        ;(verticesSource as GeoJSONSource).setData(featureCollection([]))
      }

      if (polygonPoints.length >= 2) {
        ;(lineSource as GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: polygonPoints },
              properties: {},
            },
          ],
        })
      } else {
        ;(lineSource as GeoJSONSource).setData(featureCollection([]))
      }

      const polygon = buildDrawPolygon(polygonPoints)
      if (polygon) {
        ;(polygonSource as GeoJSONSource).setData(featureCollection([polygon]))
      } else {
        ;(polygonSource as GeoJSONSource).setData(featureCollection([]))
      }
      return
    }

    ;(verticesSource as GeoJSONSource).setData(featureCollection([]))
    ;(lineSource as GeoJSONSource).setData(featureCollection([]))
    ;(polygonSource as GeoJSONSource).setData(featureCollection([]))
  }, [mapRef, selectionTool, polygonPoints])
}
