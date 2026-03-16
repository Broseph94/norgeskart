import type { Map as MapLibreMap } from 'maplibre-gl'
import { featureCollection } from '@turf/turf'
import { CHAIN_OPTIONS, CITY_LABELS } from '../constants/appConfig'
import type { CoopGeoJSON, PostalGeoJSON, PostalLabelGeoJSON } from './dataLoaders'

export function getWaterLayerId(map: MapLibreMap) {
  const layers = map.getStyle().layers ?? []
  const waterLayer = layers.find((layer) => {
    if (layer.type !== 'fill') return false
    const id = layer.id.toLowerCase()
    return id.includes('water') || id.includes('ocean') || id.includes('sea')
  })
  return waterLayer?.id
}

export function ensureCityLabelsLayer(map: MapLibreMap, waterLayerId?: string) {
  if (!map.getSource('cityLabels')) {
    map.addSource('cityLabels', {
      type: 'geojson',
      data: CITY_LABELS,
    })
  }

  if (!map.getLayer('city-labels')) {
    map.addLayer(
      {
        id: 'city-labels',
        type: 'symbol',
        source: 'cityLabels',
        minzoom: 4,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 14,
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-offset': [0, 0.4],
        },
        paint: {
          'text-color': '#1f2a37',
          'text-halo-color': '#f8fafc',
          'text-halo-width': 1,
          'text-halo-blur': 0.6,
        },
      },
      waterLayerId,
    )
  }
}

export function ensurePostalSourcesAndLayers(args: {
  map: MapLibreMap
  postalData: PostalGeoJSON
  labelData: PostalLabelGeoJSON | null
  waterLayerId?: string
}) {
  const { map, postalData, labelData, waterLayerId } = args

  if (!map.getSource('postalCodes')) {
    map.addSource('postalCodes', {
      type: 'geojson',
      data: postalData,
    })
  }

  if (!map.getSource('postalLabels') && labelData) {
    map.addSource('postalLabels', {
      type: 'geojson',
      data: labelData,
    })
  }

  if (!map.getLayer('postal-fill')) {
    map.addLayer(
      {
        id: 'postal-fill',
        type: 'fill',
        source: 'postalCodes',
        paint: {
          'fill-color': '#8897a8',
          'fill-opacity': 0.25,
        },
      },
      waterLayerId,
    )
  }

  if (!map.getLayer('postal-outline')) {
    map.addLayer(
      {
        id: 'postal-outline',
        type: 'line',
        source: 'postalCodes',
        paint: {
          'line-color': '#3a4451',
          'line-width': 0.6,
          'line-opacity': 0.7,
        },
      },
      waterLayerId,
    )
  }

  if (!map.getLayer('postal-highlight')) {
    map.addLayer(
      {
        id: 'postal-highlight',
        type: 'fill',
        source: 'postalCodes',
        paint: {
          'fill-color': '#ffb347',
          'fill-opacity': 0.55,
        },
        filter: ['in', ['get', 'postnummer'], ['literal', []]],
      },
      waterLayerId,
    )
  }

  if (!map.getLayer('postal-labels')) {
    map.addLayer({
      id: 'postal-labels',
      type: 'symbol',
      source: labelData ? 'postalLabels' : 'postalCodes',
      minzoom: 6,
      layout: {
        'text-field': ['get', 'postnummer'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 6, 9, 9, 10, 12, 11],
        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        'text-allow-overlap': false,
        'text-ignore-placement': false,
        'text-optional': true,
        'text-padding': 6,
      },
      paint: {
        'text-color': '#111827',
        'text-halo-color': '#ffffff',
        'text-halo-width': 2,
        'text-halo-blur': 1,
      },
    })
  }

  if (!map.getLayer('postal-labels-dense')) {
    map.addLayer({
      id: 'postal-labels-dense',
      type: 'symbol',
      source: labelData ? 'postalLabels' : 'postalCodes',
      minzoom: 12,
      layout: {
        'text-field': ['get', 'postnummer'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 12, 11, 16, 14],
        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        'text-allow-overlap': true,
        'text-ignore-placement': true,
        'text-padding': 2,
      },
      paint: {
        'text-color': '#111827',
        'text-halo-color': '#ffffff',
        'text-halo-width': 2,
        'text-halo-blur': 1,
      },
    })
  }

  if (map.getLayer('postal-labels')) {
    map.moveLayer('postal-labels')
  }
  if (map.getLayer('postal-labels-dense')) {
    map.moveLayer('postal-labels-dense')
  }
}

export function ensureSelectionLayers(map: MapLibreMap) {
  if (!map.getSource('selection-radius')) {
    map.addSource('selection-radius', {
      type: 'geojson',
      data: featureCollection([]),
    })
  }

  if (!map.getLayer('selection-radius-fill')) {
    map.addLayer({
      id: 'selection-radius-fill',
      type: 'fill',
      source: 'selection-radius',
      paint: {
        'fill-color': '#2563eb',
        'fill-opacity': 0.15,
      },
    })
  }

  if (!map.getLayer('selection-radius-outline')) {
    map.addLayer({
      id: 'selection-radius-outline',
      type: 'line',
      source: 'selection-radius',
      paint: {
        'line-color': '#2563eb',
        'line-width': 2,
        'line-opacity': 0.8,
      },
    })
  }

  if (!map.getSource('selection-radius-center')) {
    map.addSource('selection-radius-center', {
      type: 'geojson',
      data: featureCollection([]),
    })
  }

  if (!map.getLayer('selection-radius-center')) {
    map.addLayer({
      id: 'selection-radius-center',
      type: 'symbol',
      source: 'selection-radius-center',
      layout: {
        'text-field': '⚑',
        'text-size': 14,
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
      },
      paint: {
        'text-color': '#dc2626',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.5,
      },
    })
  }

  if (!map.getSource('selection-polygon')) {
    map.addSource('selection-polygon', {
      type: 'geojson',
      data: featureCollection([]),
    })
  }

  if (!map.getLayer('selection-polygon-fill')) {
    map.addLayer({
      id: 'selection-polygon-fill',
      type: 'fill',
      source: 'selection-polygon',
      paint: {
        'fill-color': '#0ea5e9',
        'fill-opacity': 0.15,
      },
    })
  }

  if (!map.getLayer('selection-polygon-outline')) {
    map.addLayer({
      id: 'selection-polygon-outline',
      type: 'line',
      source: 'selection-polygon',
      paint: {
        'line-color': '#0284c7',
        'line-width': 2,
        'line-opacity': 0.9,
      },
    })
  }

  if (!map.getSource('selection-polygon-vertices')) {
    map.addSource('selection-polygon-vertices', {
      type: 'geojson',
      data: featureCollection([]),
    })
  }

  if (!map.getLayer('selection-polygon-vertices')) {
    map.addLayer({
      id: 'selection-polygon-vertices',
      type: 'circle',
      source: 'selection-polygon-vertices',
      paint: {
        'circle-radius': 4,
        'circle-color': '#2563eb',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
      },
    })
  }

  if (!map.getSource('selection-polygon-line')) {
    map.addSource('selection-polygon-line', {
      type: 'geojson',
      data: featureCollection([]),
    })
  }

  if (!map.getLayer('selection-polygon-line')) {
    map.addLayer({
      id: 'selection-polygon-line',
      type: 'line',
      source: 'selection-polygon-line',
      paint: {
        'line-color': '#2563eb',
        'line-width': 2,
        'line-dasharray': [1, 1],
      },
    })
  }
}

export function ensureCoopSourceAndLayer(map: MapLibreMap, coopData: CoopGeoJSON) {
  if (!map.getSource('coopPrixStores')) {
    map.addSource('coopPrixStores', {
      type: 'geojson',
      data: coopData,
    })
  }

  if (!map.getLayer('coop-pins')) {
    map.addLayer({
      id: 'coop-pins',
      type: 'circle',
      source: 'coopPrixStores',
      paint: {
        'circle-color': [
          'match',
          ['get', 'chain'],
          'prix',
          CHAIN_OPTIONS[0].color,
          'extra',
          CHAIN_OPTIONS[1].color,
          'mega',
          CHAIN_OPTIONS[2].color,
          'obs',
          CHAIN_OPTIONS[3].color,
          'obsbygg',
          CHAIN_OPTIONS[4].color,
          '#2563eb',
        ],
        'circle-radius': 5,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1,
      },
    })
  }
}
