import type { SidebarImportProps } from './types'

export function ImportSection({
  fileInputRef,
  onCsvChange,
  onCsvDrop,
  importError,
}: SidebarImportProps) {
  return (
    <div className="sidebar-section">
      <label className="section-label" htmlFor="csv-input">
        Importer excel fil
      </label>
      <input
        id="csv-input"
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls,.xlsm,.xlsb"
        onChange={onCsvChange}
        className="file-input-hidden"
      />
      <button
        type="button"
        className="secondary-button file-dropzone"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onCsvDrop}
      >
        Last opp fil
      </button>
      {importError && <div className="status-error">{importError}</div>}
    </div>
  )
}
