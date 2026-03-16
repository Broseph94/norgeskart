import type { ChangeEvent, DragEvent, MutableRefObject } from 'react'
import type { SelectionTool } from '../../constants/appConfig'
import type { ImportSummary } from '../../types/import'
import type { CoopGeoJSON, SamvirkelagRules } from '../../utils/dataLoaders'

export type SidebarStatusProps = {
  isLoadingPostal: boolean
  postalLoadError: string | null
  isLoadingCoop: boolean
  coopLoadError: string | null
}

export type SidebarStoreFiltersProps = {
  activeChains: Record<string, boolean>
  onToggleChain: (chainId: string) => void
  storeSearch: string
  onStoreSearchChange: (value: string) => void
  storeSuggestions: CoopGeoJSON['features']
  onSelectStore: (feature: CoopGeoJSON['features'][number]) => void

  samvirkelagSearch: string
  onSamvirkelagSearchChange: (value: string) => void
  samvirkelagMenuRef: MutableRefObject<HTMLDivElement | null>
  isSamvirkelagMenuOpen: boolean
  onToggleSamvirkelagMenu: () => void
  selectedSamvirkelag: string
  selectedSamvirkelagLabel: string
  samvirkelagMenuData: {
    regularOptions: string[]
    nbdChildOptions: string[]
  }
  samvirkelagRules: SamvirkelagRules
  isNbdExpanded: boolean
  onSelectAllSamvirkelag: () => void
  onSelectRegularSamvirkelag: (value: string) => void
  onSelectNbdParent: () => void
  onSelectNbdChild: (value: string) => void
}

export type SidebarSelectionProps = {
  selectionTool: SelectionTool
  onStartRadiusMode: () => void
  onStartPolygonMode: () => void
  onCancelSelectionTool: () => void
  radiusMeters: number
  onRadiusMetersChange: (value: number) => void
  radiusCenter: [number, number] | null
  onApplyRadiusSelection: () => void
  polygonPoints: [number, number][]
  isPolygonDrawing: boolean
  onCompletePolygonSelection: () => void
  onUndoPolygonPoint: () => void
}

export type SidebarPostalInputProps = {
  postalInput: string
  onPostalInputChange: (value: string) => void
  onApplyPostalInput: () => void
}

export type SidebarImportProps = {
  fileInputRef: MutableRefObject<HTMLInputElement | null>
  onCsvChange: (event: ChangeEvent<HTMLInputElement>) => void
  onCsvDrop: (event: DragEvent<HTMLButtonElement>) => void
  importError: string | null
}

export type SidebarSummaryProps = {
  importSummary: ImportSummary | null
}

export type SidebarActionsProps = {
  onClear: () => void
  onDownloadCsv: () => void
  onDownloadXlsx: () => void
  hasHighlightedPostalcodes: boolean
}

export type SidebarProps = SidebarStatusProps &
  SidebarStoreFiltersProps &
  SidebarSelectionProps &
  SidebarPostalInputProps &
  SidebarImportProps &
  SidebarSummaryProps &
  SidebarActionsProps
