import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { SelectionTool } from '../constants/appConfig'
import { buildDrawPolygon, buildRadiusGeometry, selectPostcodesByGeometry } from '../utils/selectionGeometry'
import type { PostalGeoJSON } from '../utils/dataLoaders'

type UseSelectionActionsParams = {
  postalData: PostalGeoJSON | null
  radiusCenter: [number, number] | null
  radiusMeters: number
  polygonPoints: [number, number][]
  setSelectionTool: Dispatch<SetStateAction<SelectionTool>>
  setRadiusCenter: Dispatch<SetStateAction<[number, number] | null>>
  setPolygonPoints: Dispatch<SetStateAction<[number, number][]>>
  setIsPolygonDrawing: Dispatch<SetStateAction<boolean>>
  setHighlightedPostalcodes: Dispatch<SetStateAction<Set<string>>>
}

type UseSelectionActionsResult = {
  handleStartRadiusMode: () => void
  handleStartPolygonMode: () => void
  handleCancelSelectionTool: () => void
  handleApplyRadiusSelection: () => void
  handleCompletePolygonSelection: () => void
  handleUndoPolygonPoint: () => void
}

export function useSelectionActions({
  postalData,
  radiusCenter,
  radiusMeters,
  polygonPoints,
  setSelectionTool,
  setRadiusCenter,
  setPolygonPoints,
  setIsPolygonDrawing,
  setHighlightedPostalcodes,
}: UseSelectionActionsParams): UseSelectionActionsResult {
  const mergeHighlighted = useCallback((nextCodes: Set<string>) => {
    if (!nextCodes.size) return
    setHighlightedPostalcodes((prev) => {
      const merged = new Set(prev)
      nextCodes.forEach((code) => merged.add(code))
      return merged
    })
  }, [setHighlightedPostalcodes])

  const handleStartRadiusMode = useCallback(() => {
    setSelectionTool('radius')
    setRadiusCenter(null)
    setPolygonPoints([])
    setIsPolygonDrawing(false)
  }, [setIsPolygonDrawing, setPolygonPoints, setRadiusCenter, setSelectionTool])

  const handleStartPolygonMode = useCallback(() => {
    setSelectionTool('polygon')
    setRadiusCenter(null)
    setPolygonPoints([])
    setIsPolygonDrawing(true)
  }, [setIsPolygonDrawing, setPolygonPoints, setRadiusCenter, setSelectionTool])

  const handleCancelSelectionTool = useCallback(() => {
    setSelectionTool('none')
    setRadiusCenter(null)
    setPolygonPoints([])
    setIsPolygonDrawing(false)
  }, [setIsPolygonDrawing, setPolygonPoints, setRadiusCenter, setSelectionTool])

  const handleApplyRadiusSelection = useCallback(() => {
    if (!radiusCenter) return
    const geometry = buildRadiusGeometry(radiusCenter, radiusMeters)
    const matches = selectPostcodesByGeometry(postalData, geometry as GeoJSON.Feature<GeoJSON.Polygon>)
    mergeHighlighted(matches)
    setRadiusCenter(null)
  }, [mergeHighlighted, postalData, radiusCenter, radiusMeters, setRadiusCenter])

  const handleCompletePolygonSelection = useCallback(() => {
    const geometry = buildDrawPolygon(polygonPoints)
    if (!geometry) return
    const matches = selectPostcodesByGeometry(postalData, geometry as GeoJSON.Feature<GeoJSON.Polygon>)
    mergeHighlighted(matches)
    setPolygonPoints([])
    setIsPolygonDrawing(false)
  }, [mergeHighlighted, polygonPoints, postalData, setIsPolygonDrawing, setPolygonPoints])

  const handleUndoPolygonPoint = useCallback(() => {
    setPolygonPoints((prev) => prev.slice(0, -1))
  }, [setPolygonPoints])

  return {
    handleStartRadiusMode,
    handleStartPolygonMode,
    handleCancelSelectionTool,
    handleApplyRadiusSelection,
    handleCompletePolygonSelection,
    handleUndoPolygonPoint,
  }
}
