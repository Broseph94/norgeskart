export const NORSK_BUTIKKDRIFT_AS = 'NORSK BUTIKKDRIFT AS'
export const NBD_ALL_VALUE = '__NBD_ALL__'
export const NBD_CHILD_PREFIX = '__NBD_CHILD__::'

export type SelectionTool = 'none' | 'radius' | 'polygon'

export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
export const NORWAY_CENTER: [number, number] = [10.7522, 59.9139]
export const SUPPORTED_IMPORT_EXTENSIONS = ['csv', 'xlsx', 'xls', 'xlsm', 'xlsb'] as const

export const CHAIN_OPTIONS = [
  { id: 'prix', label: 'Coop Prix', color: '#f9da47' },
  { id: 'extra', label: 'Coop Extra', color: '#eb1907' },
  { id: 'mega', label: 'Coop Mega', color: '#164734' },
  { id: 'obs', label: 'Obs', color: '#004992' },
  { id: 'obsbygg', label: 'Obs Bygg', color: '#002855' },
] as const

export const getChainLabel = (chainId: string) =>
  CHAIN_OPTIONS.find((option) => option.id === chainId)?.label || chainId

export const CITY_LABELS: GeoJSON.FeatureCollection<GeoJSON.Point, { name: string }> = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'Oslo' },
      geometry: { type: 'Point', coordinates: [10.7522, 59.9139] },
    },
    {
      type: 'Feature',
      properties: { name: 'Bergen' },
      geometry: { type: 'Point', coordinates: [5.3221, 60.3913] },
    },
    {
      type: 'Feature',
      properties: { name: 'Stavanger' },
      geometry: { type: 'Point', coordinates: [5.7331, 58.969] },
    },
    {
      type: 'Feature',
      properties: { name: 'Kristiansand' },
      geometry: { type: 'Point', coordinates: [7.9956, 58.1467] },
    },
    {
      type: 'Feature',
      properties: { name: 'Trondheim' },
      geometry: { type: 'Point', coordinates: [10.3951, 63.4305] },
    },
    {
      type: 'Feature',
      properties: { name: 'Tromsø' },
      geometry: { type: 'Point', coordinates: [18.9553, 69.6492] },
    },
  ],
}
