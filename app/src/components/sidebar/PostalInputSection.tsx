import type { SidebarPostalInputProps } from './types'

export function PostalInputSection({
  postalInput,
  onPostalInputChange,
  onApplyPostalInput,
}: SidebarPostalInputProps) {
  return (
    <div className="sidebar-section">
      <label className="section-label" htmlFor="postal-input">
        Legg til postkoder
      </label>
      <textarea
        id="postal-input"
        className="postal-input"
        rows={4}
        value={postalInput}
        onChange={(event) => onPostalInputChange(event.target.value)}
        placeholder="Eksempel: 0150, 0151, 0152"
      />
      <button className="primary-button" type="button" onClick={onApplyPostalInput}>
        Legg til
      </button>
    </div>
  )
}
