import { CHAIN_OPTIONS, NBD_ALL_VALUE, NBD_CHILD_PREFIX } from '../../constants/appConfig'
import type { SidebarStoreFiltersProps } from './types'

export function StoreFiltersSection({
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
}: SidebarStoreFiltersProps) {
  return (
    <div className="sidebar-section">
      <div className="section-label">Butikker</div>
      <div className="toggle-list">
        {CHAIN_OPTIONS.map((option) => (
          <label key={option.id} className="toggle-item">
            <input
              type="checkbox"
              checked={activeChains[option.id]}
              onChange={() => onToggleChain(option.id)}
            />
            <span className="toggle-swatch" style={{ backgroundColor: option.color }} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      <label className="section-label" htmlFor="store-search">
        Søk i butikker
      </label>
      <div className="search-wrapper">
        <input
          id="store-search"
          className="select-input"
          type="text"
          value={storeSearch}
          onChange={(event) => onStoreSearchChange(event.target.value)}
          placeholder="Søk på butikknavn eller adresse"
        />
        {storeSearch.trim() && (
          <div className="search-suggestions">
            {storeSuggestions.length === 0 && (
              <div className="search-empty">Ingen treff.</div>
            )}
            {storeSuggestions.map((feature) => {
              const featureProps = feature.properties || {}
              const name = featureProps.name ? String(featureProps.name) : 'Butikk'
              const samvirkelag = featureProps.samvirkelag ? String(featureProps.samvirkelag) : ''
              const address = featureProps.address ? String(featureProps.address) : ''
              const key = `${name}-${address}-${samvirkelag}`
              return (
                <button
                  key={key}
                  type="button"
                  className="search-card"
                  onClick={() => onSelectStore(feature)}
                >
                  <div className="search-card-title">{name}</div>
                  {samvirkelag && <div className="search-card-sub">Samvirkelag: {samvirkelag}</div>}
                  {address && <div className="search-card-sub">{address}</div>}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <label className="section-label" htmlFor="samvirkelag-search">
        Samvirkelag
      </label>
      <div className="search-wrapper samvirkelag-menu" ref={samvirkelagMenuRef}>
        <input
          id="samvirkelag-search"
          className="select-input"
          type="text"
          value={samvirkelagSearch}
          onChange={(event) => onSamvirkelagSearchChange(event.target.value)}
          placeholder="Søk samvirkelag"
        />
        <button
          type="button"
          className="select-input samvirkelag-trigger"
          onClick={onToggleSamvirkelagMenu}
        >
          <span>{selectedSamvirkelagLabel}</span>
          <span aria-hidden="true">▾</span>
        </button>
        {isSamvirkelagMenuOpen && (
          <div className="samvirkelag-dropdown">
            <button
              type="button"
              className={`samvirkelag-option ${selectedSamvirkelag === 'Alle' ? 'active' : ''}`}
              onClick={onSelectAllSamvirkelag}
            >
              Alle
            </button>

            {samvirkelagMenuData.regularOptions.map((option) => (
              <button
                key={option}
                type="button"
                className={`samvirkelag-option ${selectedSamvirkelag === option ? 'active' : ''}`}
                onClick={() => onSelectRegularSamvirkelag(option)}
              >
                {option}
              </button>
            ))}

            {(samvirkelagMenuData.nbdChildOptions.length > 0 ||
              samvirkelagRules.norskButikkdriftLabel
                .toLowerCase()
                .includes(samvirkelagSearch.trim().toLowerCase())) && (
              <div className="samvirkelag-group">
                <button
                  type="button"
                  className={`samvirkelag-option samvirkelag-group-parent ${selectedSamvirkelag === NBD_ALL_VALUE ? 'active' : ''}`}
                  onClick={onSelectNbdParent}
                >
                  <span>{samvirkelagRules.norskButikkdriftLabel}</span>
                  <span aria-hidden="true">{isNbdExpanded ? '▾' : '▸'}</span>
                </button>
                {isNbdExpanded && (
                  <div className="samvirkelag-group-children">
                    {samvirkelagMenuData.nbdChildOptions.map((option) => {
                      const value = `${NBD_CHILD_PREFIX}${option}`
                      return (
                        <button
                          key={value}
                          type="button"
                          className={`samvirkelag-option samvirkelag-child ${selectedSamvirkelag === value ? 'active' : ''}`}
                          onClick={() => onSelectNbdChild(value)}
                        >
                          {option}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
