import type { SidebarSummaryProps } from './types'

export function SummarySection({ importSummary }: SidebarSummaryProps) {
  if (!importSummary) return null

  return (
    <div className="sidebar-section">
      <div className="summary-card">
        <div className="summary-title">
          {importSummary.source === 'text' ? 'Oppsummering (tekst)' : 'Oppsummering (CSV)'}
        </div>
        <div className="summary-row">
          <span>Lagt til</span>
          <strong>{importSummary.added}</strong>
        </div>
        <div className="summary-row">
          <span>Ugyldige</span>
          <strong>{importSummary.invalid}</strong>
        </div>
        <div className="summary-row">
          <span>Totalt</span>
          <strong>{importSummary.total}</strong>
        </div>
      </div>
    </div>
  )
}
