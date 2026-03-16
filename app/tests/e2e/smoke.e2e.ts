import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const BASE_URL = 'http://127.0.0.1:4173'

type LocatorLike = {
  click: () => Promise<void>
  isEnabled: () => Promise<boolean>
  waitFor: (options: { state: 'visible' }) => Promise<void>
}

type PageLike = {
  fill: (selector: string, value: string) => Promise<void>
  getByRole: (
    role: 'button',
    options: { name: string },
  ) => LocatorLike
  goto: (url: string, options: { waitUntil: 'domcontentloaded' }) => Promise<void>
  waitForSelector: (selector: string) => Promise<void>
}

type BrowserLike = {
  close: () => Promise<void>
  newPage: () => Promise<PageLike>
}

async function waitForServer(url: string, timeoutMs: number) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Keep polling until timeout.
    }
    await delay(300)
  }
  throw new Error(`Server did not become ready within ${timeoutMs}ms`)
}

test('smoke: app loads and export flow remains available', async (t) => {
  if (process.env.ENABLE_E2E !== '1') {
    t.skip('Set ENABLE_E2E=1 to run Playwright smoke tests.')
    return
  }

  let playwright: { chromium: { launch: () => Promise<unknown> } } | null = null
  try {
    playwright = (await import('playwright')) as { chromium: { launch: () => Promise<unknown> } }
  } catch {
    t.skip('Playwright is not installed in this environment.')
    return
  }

  const devServer = spawn(
    'npm',
    ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '4173', '--strictPort'],
    { stdio: 'pipe' },
  )

  try {
    await waitForServer(BASE_URL, 30000)
    const browser = (await playwright.chromium.launch()) as BrowserLike
    const page = await browser.newPage()
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.app-shell')

    await page.fill('#postal-input', '0150,0151')
    await page.getByRole('button', { name: 'Legg til' }).click()

    const csvButton = page.getByRole('button', { name: 'Last ned CSV' })
    await csvButton.waitFor({ state: 'visible' })
    assert.equal(await csvButton.isEnabled(), true)

    await browser.close()
  } finally {
    devServer.kill('SIGTERM')
  }
})
