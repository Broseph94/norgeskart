import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type DragEvent,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import { normalizePostnummer } from '../utils/postnummer'
import {
  extractValuesFromObjectRows,
  findPostalHeaderKey,
  flattenMatrix,
  flattenUnknownRows,
} from '../utils/importParsing'
import { SUPPORTED_IMPORT_EXTENSIONS } from '../constants/appConfig'
import type { ImportSummary } from '../types/import'

const loadPapa = async () => (await import('papaparse')).default
const loadXlsx = async () => await import('xlsx')
const loadSaveAs = async () => (await import('file-saver')).saveAs

type UsePostalImportParams = {
  validPostnummerSetRef: MutableRefObject<Set<string>>
  highlightedPostalcodes: Set<string>
  setHighlightedPostalcodes: Dispatch<SetStateAction<Set<string>>>
}

type UsePostalImportResult = {
  postalInput: string
  setPostalInput: Dispatch<SetStateAction<string>>
  importSummary: ImportSummary | null
  importError: string | null
  fileInputRef: MutableRefObject<HTMLInputElement | null>
  handleApplyPostalInput: () => void
  handleCsvChange: (event: ChangeEvent<HTMLInputElement>) => void
  handleCsvDrop: (event: DragEvent<HTMLButtonElement>) => void
  handleClear: () => void
  handleDownloadCsv: () => Promise<void>
  handleDownloadXlsx: () => Promise<void>
}

export function usePostalImport({
  validPostnummerSetRef,
  highlightedPostalcodes,
  setHighlightedPostalcodes,
}: UsePostalImportParams): UsePostalImportResult {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [postalInput, setPostalInput] = useState('')
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const mergePostalCodes = useCallback((rawValues: string[], source: ImportSummary['source'], totalRows = 0) => {
    const validSet = validPostnummerSetRef.current
    if (!validSet.size) {
      setImportSummary({ source, added: 0, invalid: rawValues.length, total: totalRows || rawValues.length })
      return
    }

    const uniqueValues = new Set<string>()
    const validCodes: string[] = []
    let invalidCount = 0

    rawValues.forEach((value) => {
      const normalized = normalizePostnummer(value)
      if (!normalized) {
        invalidCount += 1
        return
      }
      if (uniqueValues.has(normalized)) return
      uniqueValues.add(normalized)
      if (validSet.has(normalized)) {
        validCodes.push(normalized)
      } else {
        invalidCount += 1
      }
    })

    let addedCount = 0
    setHighlightedPostalcodes((prev) => {
      const next = new Set(prev)
      validCodes.forEach((code) => {
        if (!next.has(code)) {
          next.add(code)
          addedCount += 1
        }
      })
      return next
    })

    setImportSummary({
      source,
      added: addedCount,
      invalid: invalidCount,
      total: totalRows || rawValues.length,
    })
  }, [setHighlightedPostalcodes, validPostnummerSetRef])

  const handleApplyPostalInput = useCallback(() => {
    const rawValues = postalInput
      .split(/[\n,]+/)
      .map((value) => value.trim())
      .filter(Boolean)

    mergePostalCodes(rawValues, 'text')
  }, [mergePostalCodes, postalInput])

  const handleCsvFile = useCallback(async (file: File) => {
    try {
      const Papa = await loadPapa()

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (result: { data: Record<string, string>[]; meta: { fields?: string[] } }) => {
          setImportError(null)
          const originalFields = result.meta.fields || []
          const originalKey = findPostalHeaderKey(originalFields)

          if (originalKey) {
            const values = extractValuesFromObjectRows(
              result.data as Record<string, unknown>[],
              originalKey,
            )
            mergePostalCodes(values, 'csv', result.data.length)
            return
          }

          Papa.parse(file, {
            header: false,
            skipEmptyLines: true,
            complete: (fallbackResult: { data: unknown[] }) => {
              setImportError(null)
              const values = flattenUnknownRows(fallbackResult.data as unknown[])
              mergePostalCodes(values, 'csv', fallbackResult.data.length)
            },
          })
        },
        error: () => {
          setImportError('Kunne ikke lese filen.')
          setImportSummary({ source: 'csv', added: 0, invalid: 0, total: 0 })
        },
      })
    } catch {
      setImportError('Kunne ikke lese CSV-filen.')
      setImportSummary({ source: 'csv', added: 0, invalid: 0, total: 0 })
    }
  }, [mergePostalCodes])

  const handleExcelFile = useCallback(async (file: File) => {
    try {
      const XLSX = await loadXlsx()
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })

      const pickSheet = () => {
        for (const name of workbook.SheetNames) {
          const sheet = workbook.Sheets[name]
          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
          if (!rows.length) continue
          const originalKey = findPostalHeaderKey(Object.keys(rows[0]))
          if (originalKey) {
            return { sheet, rows }
          }
        }
        const fallbackName = workbook.SheetNames[0]
        return fallbackName ? { sheet: workbook.Sheets[fallbackName], rows: [] as Record<string, unknown>[] } : null
      }

      const picked = pickSheet()
      if (!picked?.sheet) {
        setImportError('Kunne ikke lese filen.')
        setImportSummary({ source: 'csv', added: 0, invalid: 0, total: 0 })
        return
      }

      const rows = picked.rows.length
        ? picked.rows
        : XLSX.utils.sheet_to_json<Record<string, unknown>>(picked.sheet, { defval: '' })

      if (rows.length) {
        const originalKey = findPostalHeaderKey(Object.keys(rows[0]))
        if (originalKey) {
          const values = extractValuesFromObjectRows(rows, originalKey)
          setImportError(null)
          mergePostalCodes(values, 'csv', rows.length)
          return
        }
      }

      const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(picked.sheet, {
        header: 1,
        blankrows: false,
        defval: '',
      })
      const fallbackValues = flattenMatrix(matrix)
      setImportError(null)
      mergePostalCodes(fallbackValues, 'csv', matrix.length)
    } catch {
      setImportError('Kunne ikke lese Excel-filen.')
      setImportSummary({ source: 'csv', added: 0, invalid: 0, total: 0 })
    }
  }, [mergePostalCodes])

  const handleImportFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    if (!SUPPORTED_IMPORT_EXTENSIONS.includes(ext as (typeof SUPPORTED_IMPORT_EXTENSIONS)[number])) {
      setImportError('Filformat støttes ikke. Støttede formater er: .csv, .xlsx, .xls, .xlsm, .xlsb.')
      setImportSummary(null)
      return
    }
    if (ext === 'csv') {
      await handleCsvFile(file)
      return
    }
    await handleExcelFile(file)
  }, [handleCsvFile, handleExcelFile])

  const handleCsvChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    void handleImportFile(file)
  }, [handleImportFile])

  const handleCsvDrop = useCallback((event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const file = event.dataTransfer.files?.[0]
    if (!file) return
    void handleImportFile(file)
  }, [handleImportFile])

  const handleClear = useCallback(() => {
    setHighlightedPostalcodes(new Set())
    setImportSummary(null)
    setPostalInput('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [setHighlightedPostalcodes])

  const handleDownloadCsv = useCallback(async () => {
    if (!highlightedPostalcodes.size) return
    const saveAs = await loadSaveAs()
    const sorted = Array.from(highlightedPostalcodes).sort()
    const values = sorted.join(',')
    const csv = `\uFEFFpostnummer\n"${values}"`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    saveAs(blob, 'postnummer.csv')
  }, [highlightedPostalcodes])

  const handleDownloadXlsx = useCallback(async () => {
    if (!highlightedPostalcodes.size) return
    const XLSX = await loadXlsx()
    const saveAs = await loadSaveAs()
    const sorted = Array.from(highlightedPostalcodes).sort()
    const values = sorted.join(',')
    const worksheet = XLSX.utils.aoa_to_sheet([['postnummer'], [values]])
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Postnummer')
    const out = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    saveAs(blob, 'postnummer.xlsx')
  }, [highlightedPostalcodes])

  return {
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
  }
}
