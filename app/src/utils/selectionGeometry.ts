import { booleanIntersects, circle as turfCircle, polygon as turfPolygon } from '@turf/turf'
import { normalizePostnummer } from './postnummer'
import type { PostalGeoJSON } from './dataLoaders'

export function buildRadiusGeometry(center: [number, number], meters: number) {
  return turfCircle(center, meters, { units: 'meters', steps: 96 })
}

export function buildDrawPolygon(points: [number, number][]) {
  if (points.length < 3) return null
  return turfPolygon([[...points, points[0]]])
}

export function selectPostcodesByGeometry(
  postalData: PostalGeoJSON | null,
  geometry: GeoJSON.Feature<GeoJSON.Polygon>,
) {
  const matches = new Set<string>()
  if (!postalData?.features?.length) return matches

  postalData.features.forEach((feature) => {
    const postnummer = normalizePostnummer(String(feature.properties?.postnummer || ''))
    if (!postnummer || !feature.geometry) return
    try {
      if (booleanIntersects(feature as GeoJSON.Feature<GeoJSON.Geometry>, geometry)) {
        matches.add(postnummer)
      }
    } catch {
      return
    }
  })

  return matches
}
