import { useCallback, useEffect, useMemo, useState, type MutableRefObject } from 'react'
import { NBD_ALL_VALUE, NBD_CHILD_PREFIX, NORSK_BUTIKKDRIFT_AS } from '../constants/appConfig'
import { buildSamvirkelagMenuData, buildSelectedSamvirkelagLabel } from '../utils/coopFiltering'
import type { CoopGeoJSON, SamvirkelagRules } from '../utils/dataLoaders'
import { canonicalizeStoreName, normalizeForCompare } from '../utils/storeNormalization'

type CoopStoreProps = CoopGeoJSON['features'][number]['properties']

type UseSamvirkelagFilterParams = {
  coopStores: CoopGeoJSON | null
  samvirkelagRules: SamvirkelagRules
  samvirkelagMenuRef: MutableRefObject<HTMLDivElement | null>
}

type UseSamvirkelagFilterResult = {
  selectedSamvirkelag: string
  samvirkelagSearch: string
  setSamvirkelagSearch: (value: string) => void
  isSamvirkelagMenuOpen: boolean
  toggleSamvirkelagMenu: () => void
  samvirkelagMenuData: {
    regularOptions: string[]
    nbdChildOptions: string[]
  }
  selectedSamvirkelagLabel: string
  isNbdExpanded: boolean
  handleSelectAllSamvirkelag: () => void
  handleSelectRegularSamvirkelag: (value: string) => void
  handleSelectNbdParent: () => void
  handleSelectNbdChild: (value: string) => void
  matchesSelectedSamvirkelag: (props: CoopStoreProps) => boolean
}

export function useSamvirkelagFilter({
  coopStores,
  samvirkelagRules,
  samvirkelagMenuRef,
}: UseSamvirkelagFilterParams): UseSamvirkelagFilterResult {
  const [selectedSamvirkelag, setSelectedSamvirkelag] = useState('Alle')
  const [samvirkelagSearch, setSamvirkelagSearchState] = useState('')
  const [isSamvirkelagMenuOpen, setIsSamvirkelagMenuOpen] = useState(false)
  const [isNbdExpanded, setIsNbdExpanded] = useState(false)

  const normalizedWhitelistSet = useMemo(
    () => new Set(samvirkelagRules.samvirkelagWhitelist.map((value) => normalizeForCompare(value))),
    [samvirkelagRules.samvirkelagWhitelist],
  )
  const normalizedNbasNameSet = useMemo(
    () => new Set(samvirkelagRules.nbasStoreNames.map((value) => canonicalizeStoreName(value))),
    [samvirkelagRules.nbasStoreNames],
  )
  const normalizedNbdLabel = useMemo(
    () => normalizeForCompare(samvirkelagRules.norskButikkdriftLabel),
    [samvirkelagRules.norskButikkdriftLabel],
  )
  const normalizedNbdAs = useMemo(() => normalizeForCompare(NORSK_BUTIKKDRIFT_AS), [])

  const isNbdStore = useCallback((props: CoopStoreProps) => {
    if (props?.nbd_group === true) return true

    const samvirkelag = props?.samvirkelag ? String(props.samvirkelag) : ''
    const name = props?.name ? String(props.name) : ''
    const normalizedSamvirkelag = normalizeForCompare(samvirkelag)
    const normalizedName = canonicalizeStoreName(name)

    if (normalizedWhitelistSet.has(normalizedSamvirkelag)) return false
    if (normalizedSamvirkelag === normalizedNbdAs) return true
    if (normalizedSamvirkelag === normalizedNbdLabel) return true
    return normalizedNbasNameSet.has(normalizedName)
  }, [normalizedWhitelistSet, normalizedNbdAs, normalizedNbdLabel, normalizedNbasNameSet])

  const matchesSelectedSamvirkelag = useCallback((props: CoopStoreProps) => {
    if (selectedSamvirkelag === 'Alle') return true
    if (selectedSamvirkelag === NBD_ALL_VALUE) return isNbdStore(props)
    if (selectedSamvirkelag.startsWith(NBD_CHILD_PREFIX)) {
      const childValue = selectedSamvirkelag.slice(NBD_CHILD_PREFIX.length)
      const samvirkelag = props?.samvirkelag ? String(props.samvirkelag) : ''
      return isNbdStore(props) && samvirkelag === childValue
    }
    const samvirkelag = props?.samvirkelag ? String(props.samvirkelag) : ''
    return samvirkelag === selectedSamvirkelag
  }, [isNbdStore, selectedSamvirkelag])

  const samvirkelagMenuData = useMemo(() => buildSamvirkelagMenuData({
    coopStores,
    isNbdStore,
    normalizeForCompare,
    normalizedNbdAs,
    normalizedNbdLabel,
    norskButikkdriftLabel: samvirkelagRules.norskButikkdriftLabel,
    samvirkelagSearch,
  }), [coopStores, isNbdStore, normalizedNbdAs, normalizedNbdLabel, samvirkelagRules.norskButikkdriftLabel, samvirkelagSearch])

  const selectedSamvirkelagLabel = useMemo(
    () =>
      buildSelectedSamvirkelagLabel({
        selectedSamvirkelag,
        nbdAllValue: NBD_ALL_VALUE,
        nbdChildPrefix: NBD_CHILD_PREFIX,
        norskButikkdriftLabel: samvirkelagRules.norskButikkdriftLabel,
      }),
    [samvirkelagRules.norskButikkdriftLabel, selectedSamvirkelag],
  )

  useEffect(() => {
    if (!isSamvirkelagMenuOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (!samvirkelagMenuRef.current) return
      if (samvirkelagMenuRef.current.contains(event.target as Node)) return
      setIsSamvirkelagMenuOpen(false)
    }

    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [isSamvirkelagMenuOpen, samvirkelagMenuRef])

  const handleSelectAllSamvirkelag = useCallback(() => {
    setSelectedSamvirkelag('Alle')
    setIsSamvirkelagMenuOpen(false)
  }, [])

  const handleSelectRegularSamvirkelag = useCallback((value: string) => {
    setSelectedSamvirkelag(value)
    setIsSamvirkelagMenuOpen(false)
  }, [])

  const handleSelectNbdParent = useCallback(() => {
    setSelectedSamvirkelag(NBD_ALL_VALUE)
    setIsNbdExpanded((prev) => !prev)
  }, [])

  const handleSelectNbdChild = useCallback((value: string) => {
    setSelectedSamvirkelag(value)
    setIsSamvirkelagMenuOpen(false)
  }, [])

  const toggleSamvirkelagMenu = useCallback(() => {
    setIsSamvirkelagMenuOpen((prev) => !prev)
  }, [])

  const setSamvirkelagSearch = useCallback((value: string) => {
    setSamvirkelagSearchState(value)
  }, [])

  return {
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
  }
}
