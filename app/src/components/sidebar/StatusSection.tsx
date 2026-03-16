import type { SidebarStatusProps } from './types'

export function StatusSection({
  isLoadingPostal,
  postalLoadError,
  isLoadingCoop,
  coopLoadError,
}: SidebarStatusProps) {
  return (
    <div className="sidebar-section">
      <div className="status">
        {isLoadingPostal && <span>Laster postsoner...</span>}
        {postalLoadError && <span className="status-error">{postalLoadError}</span>}
      </div>
      <div className="status">
        {isLoadingCoop && <span>Laster butikker...</span>}
        {coopLoadError && <span className="status-error">{coopLoadError}</span>}
      </div>
    </div>
  )
}
