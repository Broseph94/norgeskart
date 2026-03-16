import type { SidebarSelectionProps } from './types'

export function SelectionSection({
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
}: SidebarSelectionProps) {
  return (
    <div className="sidebar-section">
      <div className="section-label">Geografisk markering</div>
      <div className="tool-button-row">
        <button
          type="button"
          className={`secondary-button tool-button ${selectionTool === 'radius' ? 'tool-button-active' : ''}`}
          onClick={onStartRadiusMode}
        >
          Radius
        </button>
        <button
          type="button"
          className={`secondary-button tool-button ${selectionTool === 'polygon' ? 'tool-button-active' : ''}`}
          onClick={onStartPolygonMode}
        >
          Polygon
        </button>
        <button
          type="button"
          className="secondary-button tool-button"
          onClick={onCancelSelectionTool}
        >
          Avbryt
        </button>
      </div>

      {selectionTool === 'radius' && (
        <div className="tool-panel">
          <label className="section-label" htmlFor="radius-slider">
            Radius:{' '}
            {radiusMeters >= 1000
              ? `${(radiusMeters / 1000).toFixed(1)} km`
              : `${radiusMeters} m`}
          </label>
          <input
            id="radius-slider"
            type="range"
            min={100}
            max={50000}
            step={100}
            value={radiusMeters}
            onChange={(event) => onRadiusMetersChange(Number(event.target.value))}
          />
          <button
            type="button"
            className="primary-button"
            onClick={onApplyRadiusSelection}
            disabled={!radiusCenter}
          >
            Marker postkoder
          </button>
        </div>
      )}

      {selectionTool === 'polygon' && (
        <div className="tool-panel">
          <div className="status">
            Punkter: {polygonPoints.length} {isPolygonDrawing ? '(tegning aktiv)' : ''}
          </div>
          <div className="tool-button-row">
            <button
              type="button"
              className="primary-button tool-button"
              onClick={onCompletePolygonSelection}
              disabled={polygonPoints.length < 3}
            >
              Marker postkoder
            </button>
            <button
              type="button"
              className="secondary-button tool-button"
              onClick={onUndoPolygonPoint}
              disabled={!polygonPoints.length}
            >
              Fjern siste punkt
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
