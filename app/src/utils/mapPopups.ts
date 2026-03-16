type StorePopupInput = {
  name?: string
  address?: string
  chainLabel?: string
  samvirkelag?: string
}

function appendTextRow(container: HTMLElement, label: string, value: string) {
  if (!value) return
  const row = document.createElement('div')
  row.textContent = `${label}: ${value}`
  container.appendChild(row)
}

export function buildStorePopupContent(input: StorePopupInput): HTMLElement {
  const root = document.createElement('div')
  root.style.fontFamily = "'Space Grotesk', sans-serif"

  const title = document.createElement('strong')
  title.textContent = input.name || 'Butikk'
  root.appendChild(title)

  appendTextRow(root, 'Adresse', input.address || '')
  appendTextRow(root, 'Kjede', input.chainLabel || '')
  appendTextRow(root, 'Samvirkelag', input.samvirkelag || '')

  return root
}
