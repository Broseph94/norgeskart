import {
  useRef,
  useState,
} from 'react'
import { type Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './App.css'
import {
  DEFAULT_SAMVIRKELAG_RULES,
  type CoopGeoJSON,
  type PostalGeoJSON,
  type SamvirkelagRules,
} from './utils/dataLoaders'
import { type SelectionTool } from './constants/appConfig'
import { Sidebar } from './components/Sidebar'
import { usePostalImport } from './hooks/usePostalImport'
import { useSelectionMapEffects } from './hooks/useSelectionMapEffects'
import { useMapInitialization } from './hooks/useMapInitialization'
import { useSamvirkelagFilter } from './hooks/useSamvirkelagFilter'
import { useCoopMapFiltering } from './hooks/useCoopMapFiltering'
import { useSelectionActions } from './hooks/useSelectionActions'
import { useStoreSelection } from './hooks/useStoreSelection'
import { usePostalHighlightLayer } from './hooks/usePostalHighlightLayer'

function App() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const validPostnummerSetRef = useRef<Set<string>>(new Set())
  const samvirkelagMenuRef = useRef<HTMLDivElement | null>(null)

  const [highlightedPostalcodes, setHighlightedPostalcodes] = useState<Set<string>>(new Set())
  const [isLoadingPostal, setIsLoadingPostal] = useState(true)
  const [postalLoadError, setPostalLoadError] = useState<string | null>(null)
  const [isLoadingCoop, setIsLoadingCoop] = useState(true)
  const [coopLoadError, setCoopLoadError] = useState<string | null>(null)
  const [coopStores, setCoopStores] = useState<CoopGeoJSON | null>(null)
  const [samvirkelagRules, setSamvirkelagRules] = useState<SamvirkelagRules>(DEFAULT_SAMVIRKELAG_RULES)
  const [storeSearch, setStoreSearch] = useState('')
  const [postalData, setPostalData] = useState<PostalGeoJSON | null>(null)
  const [selectionTool, setSelectionTool] = useState<SelectionTool>('none')
  const [radiusMeters, setRadiusMeters] = useState(1000)
  const [radiusCenter, setRadiusCenter] = useState<[number, number] | null>(null)
  const [polygonPoints, setPolygonPoints] = useState<[number, number][]>([])
  const [isPolygonDrawing, setIsPolygonDrawing] = useState(false)

  const selectionToolRef = useRef<SelectionTool>('none')
  const radiusCenterRef = useRef<[number, number] | null>(null)
  const polygonPointsRef = useRef<[number, number][]>([])
  const draggingVertexIndexRef = useRef<number | null>(null)
  const isDraggingVertexRef = useRef(false)
  const suppressMapClickUntilRef = useRef(0)
  const {
    postalInput,
    setPostalInput,
    importSummary,
    importError,
    fileInputRef,
    handleApplyPostalInput,
    handleCsvChange,
    handleCsvDrop,
    handleClear,
    handleDownloadCsv,
    handleDownloadXlsx,
  } = usePostalImport({
    validPostnummerSetRef,
    highlightedPostalcodes,
    setHighlightedPostalcodes,
  })
  const {
    selectedSamvirkelag,
    samvirkelagSearch,
    setSamvirkelagSearch,
    isSamvirkelagMenuOpen,
    toggleSamvirkelagMenu,
    samvirkelagMenuData,
    selectedSamvirkelagLabel,
    isNbdExpanded,
    handleSelectAllSamvirkelag,
    handleSelectRegularSamvirkelag,
    handleSelectNbdParent,
    handleSelectNbdChild,
    matchesSelectedSamvirkelag,
  } = useSamvirkelagFilter({
    coopStores,
    samvirkelagRules,
    samvirkelagMenuRef,
  })
  const {
    activeChains,
    handleChainToggle,
    storeSuggestions,
  } = useCoopMapFiltering({
    mapRef,
    coopStores,
    storeSearch,
    matchesSelectedSamvirkelag,
  })
  const { handleSelectStore } = useStoreSelection({ mapRef })
  const {
    handleStartRadiusMode,
    handleStartPolygonMode,
    handleCancelSelectionTool,
    handleApplyRadiusSelection,
    handleCompletePolygonSelection,
    handleUndoPolygonPoint,
  } = useSelectionActions({
    postalData,
    radiusCenter,
    radiusMeters,
    polygonPoints,
    setSelectionTool,
    setRadiusCenter,
    setPolygonPoints,
    setIsPolygonDrawing,
    setHighlightedPostalcodes,
  })

  useSelectionMapEffects({
    mapRef,
    selectionTool,
    selectionToolRef,
    radiusCenter,
    radiusCenterRef,
    radiusMeters,
    polygonPoints,
    polygonPointsRef,
  })
  useMapInitialization({
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
  })
  usePostalHighlightLayer({ mapRef, highlightedPostalcodes })

  return (
    <div className="app-shell">
      <Sidebar
        isLoadingPostal={isLoadingPostal}
        postalLoadError={postalLoadError}
        isLoadingCoop={isLoadingCoop}
        coopLoadError={coopLoadError}
        activeChains={activeChains}
        onToggleChain={handleChainToggle}
        storeSearch={storeSearch}
        onStoreSearchChange={setStoreSearch}
        storeSuggestions={storeSuggestions}
        onSelectStore={handleSelectStore}
        samvirkelagSearch={samvirkelagSearch}
        onSamvirkelagSearchChange={setSamvirkelagSearch}
        samvirkelagMenuRef={samvirkelagMenuRef}
        isSamvirkelagMenuOpen={isSamvirkelagMenuOpen}
        onToggleSamvirkelagMenu={toggleSamvirkelagMenu}
        selectedSamvirkelag={selectedSamvirkelag}
        selectedSamvirkelagLabel={selectedSamvirkelagLabel}
        samvirkelagMenuData={samvirkelagMenuData}
        samvirkelagRules={samvirkelagRules}
        isNbdExpanded={isNbdExpanded}
        onSelectAllSamvirkelag={handleSelectAllSamvirkelag}
        onSelectRegularSamvirkelag={handleSelectRegularSamvirkelag}
        onSelectNbdParent={handleSelectNbdParent}
        onSelectNbdChild={handleSelectNbdChild}
        selectionTool={selectionTool}
        onStartRadiusMode={handleStartRadiusMode}
        onStartPolygonMode={handleStartPolygonMode}
        onCancelSelectionTool={handleCancelSelectionTool}
        radiusMeters={radiusMeters}
        onRadiusMetersChange={setRadiusMeters}
        radiusCenter={radiusCenter}
        onApplyRadiusSelection={handleApplyRadiusSelection}
        polygonPoints={polygonPoints}
        isPolygonDrawing={isPolygonDrawing}
        onCompletePolygonSelection={handleCompletePolygonSelection}
        onUndoPolygonPoint={handleUndoPolygonPoint}
        postalInput={postalInput}
        onPostalInputChange={setPostalInput}
        onApplyPostalInput={handleApplyPostalInput}
        fileInputRef={fileInputRef}
        onCsvChange={handleCsvChange}
        onCsvDrop={handleCsvDrop}
        importError={importError}
        importSummary={importSummary}
        onClear={handleClear}
        onDownloadCsv={() => {
          void handleDownloadCsv()
        }}
        onDownloadXlsx={() => {
          void handleDownloadXlsx()
        }}
        hasHighlightedPostalcodes={highlightedPostalcodes.size > 0}
      />

      <main className="map-panel">
        <div ref={mapContainerRef} className="map-container" />
      </main>
    </div>
  )
}

export default App
