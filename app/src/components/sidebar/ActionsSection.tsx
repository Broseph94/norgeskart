import type { SidebarActionsProps } from './types'

export function ActionsSection({
  onClear,
  onDownloadCsv,
  onDownloadXlsx,
  hasHighlightedPostalcodes,
}: SidebarActionsProps) {
  return (
    <div className="sidebar-section actions">
      <button className="secondary-button" type="button" onClick={onClear}>
        Reset
      </button>
      <button
        className="primary-button"
        type="button"
        onClick={onDownloadCsv}
        disabled={!hasHighlightedPostalcodes}
      >
        Last ned CSV
      </button>
      <button
        className="primary-button"
        type="button"
        onClick={onDownloadXlsx}
        disabled={!hasHighlightedPostalcodes}
      >
        Last ned XLSX
      </button>
    </div>
  )
}
