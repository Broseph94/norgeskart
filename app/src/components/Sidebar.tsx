import { ActionsSection } from './sidebar/ActionsSection'
import { ImportSection } from './sidebar/ImportSection'
import { PostalInputSection } from './sidebar/PostalInputSection'
import { SelectionSection } from './sidebar/SelectionSection'
import { StatusSection } from './sidebar/StatusSection'
import { StoreFiltersSection } from './sidebar/StoreFiltersSection'
import { SummarySection } from './sidebar/SummarySection'
import type { SidebarProps } from './sidebar/types'

export function Sidebar({
  isLoadingPostal,
  postalLoadError,
  isLoadingCoop,
  coopLoadError,
  activeChains,
  onToggleChain,
  storeSearch,
  onStoreSearchChange,
  storeSuggestions,
  onSelectStore,
  samvirkelagSearch,
  onSamvirkelagSearchChange,
  samvirkelagMenuRef,
  isSamvirkelagMenuOpen,
  onToggleSamvirkelagMenu,
  selectedSamvirkelag,
  selectedSamvirkelagLabel,
  samvirkelagMenuData,
  samvirkelagRules,
  isNbdExpanded,
  onSelectAllSamvirkelag,
  onSelectRegularSamvirkelag,
  onSelectNbdParent,
  onSelectNbdChild,
  selectionTool,
  onStartRadiusMode,
  onStartPolygonMode,
  onCancelSelectionTool,
  radiusMeters,
  onRadiusMetersChange,
  radiusCenter,
  onApplyRadiusSelection,
  polygonPoints,
  isPolygonDrawing,
  onCompletePolygonSelection,
  onUndoPolygonPoint,
  postalInput,
  onPostalInputChange,
  onApplyPostalInput,
  fileInputRef,
  onCsvChange,
  onCsvDrop,
  importError,
  importSummary,
  onClear,
  onDownloadCsv,
  onDownloadXlsx,
  hasHighlightedPostalcodes,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1>Norgeskart</h1>
      </div>

      <StatusSection
        isLoadingPostal={isLoadingPostal}
        postalLoadError={postalLoadError}
        isLoadingCoop={isLoadingCoop}
        coopLoadError={coopLoadError}
      />

      <StoreFiltersSection
        activeChains={activeChains}
        onToggleChain={onToggleChain}
        storeSearch={storeSearch}
        onStoreSearchChange={onStoreSearchChange}
        storeSuggestions={storeSuggestions}
        onSelectStore={onSelectStore}
        samvirkelagSearch={samvirkelagSearch}
        onSamvirkelagSearchChange={onSamvirkelagSearchChange}
        samvirkelagMenuRef={samvirkelagMenuRef}
        isSamvirkelagMenuOpen={isSamvirkelagMenuOpen}
        onToggleSamvirkelagMenu={onToggleSamvirkelagMenu}
        selectedSamvirkelag={selectedSamvirkelag}
        selectedSamvirkelagLabel={selectedSamvirkelagLabel}
        samvirkelagMenuData={samvirkelagMenuData}
        samvirkelagRules={samvirkelagRules}
        isNbdExpanded={isNbdExpanded}
        onSelectAllSamvirkelag={onSelectAllSamvirkelag}
        onSelectRegularSamvirkelag={onSelectRegularSamvirkelag}
        onSelectNbdParent={onSelectNbdParent}
        onSelectNbdChild={onSelectNbdChild}
      />

      <SelectionSection
        selectionTool={selectionTool}
        onStartRadiusMode={onStartRadiusMode}
        onStartPolygonMode={onStartPolygonMode}
        onCancelSelectionTool={onCancelSelectionTool}
        radiusMeters={radiusMeters}
        onRadiusMetersChange={onRadiusMetersChange}
        radiusCenter={radiusCenter}
        onApplyRadiusSelection={onApplyRadiusSelection}
        polygonPoints={polygonPoints}
        isPolygonDrawing={isPolygonDrawing}
        onCompletePolygonSelection={onCompletePolygonSelection}
        onUndoPolygonPoint={onUndoPolygonPoint}
      />

      <PostalInputSection
        postalInput={postalInput}
        onPostalInputChange={onPostalInputChange}
        onApplyPostalInput={onApplyPostalInput}
      />

      <ImportSection
        fileInputRef={fileInputRef}
        onCsvChange={onCsvChange}
        onCsvDrop={onCsvDrop}
        importError={importError}
      />

      <SummarySection importSummary={importSummary} />

      <ActionsSection
        onClear={onClear}
        onDownloadCsv={onDownloadCsv}
        onDownloadXlsx={onDownloadXlsx}
        hasHighlightedPostalcodes={hasHighlightedPostalcodes}
      />
    </aside>
  )
}
