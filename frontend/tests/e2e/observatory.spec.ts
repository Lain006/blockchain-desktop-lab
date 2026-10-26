import { expect, test, type Page } from '@playwright/test'
// 测试工具启动现有 CommonJS CLI，不替换后端实现。
// @ts-expect-error Node 测试工具为独立 .mjs，前端类型检查不包含测试目录。
import { createNetwork, startNode, until } from '../helpers/real-nodes.mjs'
import fs from 'node:fs/promises'

let network: Awaited<ReturnType<typeof createNetwork>>
let scriptErrors: string[] = []
const artifacts = 'test-results/observatory'
test.beforeAll(async () => { network = await createNetwork(); await fs.mkdir(artifacts, { recursive: true }) })
test.afterAll(async () => { await network?.stop() })
test.beforeEach(async ({ page }) => { scriptErrors = []; page.on('pageerror', (error) => scriptErrors.push(error.message)) })
test.afterEach(async () => { expect(scriptErrors).toEqual([]) })

let directoryControl: { node: Awaited<ReturnType<typeof startNode>>; status: number; delay: number }
async function routeDirectory(page: Page) {
  await page.route('http://127.0.0.1:3001/nodes', async (route) => {
    if (directoryControl.delay) await new Promise((resolve) => setTimeout(resolve, directoryControl.delay))
    if (directoryControl.status !== 200) { await route.fulfill({ status: directoryControl.status, json: [] }).catch(() => {}); return }
    try {
      const response = await route.fetch({ url: `${directoryControl.node.api}/nodes` })
      await route.fulfill({ response })
    } catch { await route.abort('connectionrefused').catch(() => {}) }
  })
}
test.beforeEach(async ({ page }) => {
  directoryControl = { node: network.a, status: 200, delay: 0 }
  const addresses = await (await fetch(`${network.a.api}/nodes`)).json()
  for (const address of addresses) if (address !== network.a.api) network.a.send(`unobserve ${address}`)
  await until(async () => (await (await fetch(`${network.a.api}/nodes`)).json()).length === 1)
  await routeDirectory(page)
})
async function add(page: Page, api: string) {
  // 节点来源只能通过真实后端 CLI 修改；这里没有前端添加操作。
  directoryControl.node.send(`observe ${api}`)
  await until(async () => (await (await fetch(`${directoryControl.node.api}/nodes`)).json()).includes(api))
  const refresh = page.getByRole('button', { name: '刷新链', exact: true })
  await expect(refresh).toBeEnabled()
  await refresh.click()
  const tab = page.locator(`.node-tab[title="${api}"]`)
  await expect(tab).toBeVisible()
  await tab.click()
  await expect(page.locator('.endpoint')).toContainText(api)
  await expect(page.locator('.chain-block').first()).toBeVisible()
  if (page.viewportSize()!.width >= 768) await expect(page.locator('.inspector .detail-index')).toBeVisible()
}

test('真实双节点、字段检查、P2P 同步与新区块追加', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('button', { name: '添加节点', exact: true })).toHaveCount(0)
  await expect(page.getByLabel('节点 API 地址', { exact: true })).toHaveCount(0)
  await add(page, network.a.api)
  await expect(page.locator('.inspector .detail-index')).toHaveText('#2')
  await expect(page.locator('.chain-connection')).toHaveCount(2)
  await page.getByRole('button', { name: '1 个对等连接' }).click()
  await expect(page.locator('.peer-list')).toContainText(String(network.b.p2pPort))
  await expect(page.locator('.peer-note')).toContainText('不代表全网拓扑')
  await add(page, network.b.api)
  await expect(page.locator('.node-tab')).toHaveCount(2)
  await page.getByRole('button', { name: new RegExp(`节点 ${network.a.p2pPort}`) }).click()
  await expect(page.locator('.endpoint')).toContainText(network.a.api)
  await page.getByLabel('定位高度或完整 Hash').fill('#0')
  await page.getByLabel('定位高度或完整 Hash').press('Enter')
  await expect(page.locator('.inspector .detail-index')).toHaveText('#0')
  network.b.send('mine "浏览器联调真实新增区块"')
  await until(async () => (await network.a.blocks()).length === 4, '真实区块广播')
  await expect(page.locator('.height-readout')).toContainText('4 个区块')
  await expect(page.locator('.new-block-notice')).toContainText('收到 1 个新区块')
  await expect(page.locator('.inspector .detail-index')).toHaveText('#0')
  await page.getByRole('button', { name: '定位最新', exact: true }).click()
  await expect(page.locator('.inspector .data-value')).toHaveText('浏览器联调真实新增区块')
  await page.locator('.peer-toggle').click()
  await page.screenshot({ path: `${artifacts}/desktop-1440.png`, fullPage: true, animations: 'disabled' })
  expect(errors).toEqual([])
})

test('键盘、定位、缩放与剪贴板成功及失败', async ({ page, context }) => {
  await page.goto('/')
  await add(page, network.a.api)
  await page.locator('.chain-canvas').focus()
  await page.keyboard.press('Home')
  await expect(page.locator('.inspector .detail-index')).toHaveText('#0')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.inspector .detail-index')).toHaveText('#1')
  await page.getByRole('button', { name: /前一区块/ }).click()
  await expect(page.locator('.inspector .detail-index')).toHaveText('#0')
  await page.getByRole('button', { name: '放大', exact: true }).click()
  const zoom = await page.locator('.zoom-value').textContent()
  await page.getByRole('button', { name: '缩小', exact: true }).click()
  expect(await page.locator('.zoom-value').textContent()).not.toBe(zoom)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: '复制 Hash', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Hash 已复制', exact: true })).toBeVisible()
  const genesis = (await network.a.blocks())[0]
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(genesis.hash)
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied') } } }) })
  await page.getByRole('button', { name: '复制 Prev Hash', exact: true }).click()
  await expect(page.getByText('复制失败，请选中完整字段后手动复制。')).toBeVisible()
})

test('部分接口失败保留快照、空链与异常字段不会伪造数据', async ({ page }) => {
  await page.goto('/')
  await add(page, network.a.api)
  await page.route(`${network.a.api}/peers`, (route) => route.fulfill({ status: 503, json: { error: 'test' } }))
  await page.getByRole('button', { name: '刷新链', exact: true }).click()
  await expect(page.locator('.request-errors')).toContainText('HTTP 503')
  await expect(page.getByText('API 可访问', { exact: true }).first()).toBeVisible()
  await expect(page.locator('.chain-block').first()).toBeVisible()
  await expect(page.locator('.peer-toggle')).toContainText('对等连接查询失败')
  await page.unroute(`${network.a.api}/peers`)
  await page.route(`${network.a.api}/blocks`, (route) => route.fulfill({ json: [] }))
  await page.getByRole('button', { name: '立即重试', exact: true }).click()
  await expect(page.getByText('节点尚未返回区块')).toBeVisible()
  const raw = (await network.a.blocks()).map((item: Record<string, unknown>, i: number) => i === 0 ? { ...item, timestamp: 'bad', nonce: null, data: '<img src=x onerror="window.injected=true">' } : item)
  await page.unroute(`${network.a.api}/blocks`)
  await page.route(`${network.a.api}/blocks`, (route) => route.fulfill({ json: raw }))
  await page.getByRole('button', { name: '重新读取', exact: true }).click()
  await expect(page.locator('.chain-block').first()).toBeVisible()
  await page.getByLabel('定位高度或完整 Hash').fill('0')
  await page.getByLabel('定位高度或完整 Hash').press('Enter')
  await expect(page.locator('.field-warning')).toContainText('时间戳无效')
  await expect(page.locator('.inspector .data-value')).toContainText('<img src=x')
  expect(await page.locator('.data-value img').count()).toBe(0)
})

test('五种宽度、移动详情、触摸平移与减少动态效果', async ({ page, browser }) => {
  await page.goto('/')
  await add(page, network.a.api)
  for (const width of [1440, 1280, 768, 390, 360]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(() => document.fonts.ready)
    await expect(page.locator('.chain-canvas')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    if (width < 768) {
      const selected = await page.locator('.chain-block.selected').boundingBox()
      const controls = await page.locator('.canvas-controls').boundingBox()
      expect(selected!.y + selected!.height).toBeLessThan(controls!.y)
      await page.getByRole('button', { name: /检查区块/ }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByRole('dialog').locator('.hash-value').first()).toBeVisible()
      await page.getByRole('dialog').evaluate(async (element) => { await Promise.allSettled(element.getAnimations().map((animation) => animation.finished)) })
      await page.screenshot({ path: `${artifacts}/mobile-details-${width}.png`, fullPage: true, animations: 'disabled' })
      await page.getByRole('button', { name: '关闭区块详情' }).click()
    }
    await page.screenshot({ path: `${artifacts}/viewport-${width}.png`, fullPage: true, animations: 'disabled' })
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await page.locator('.intro').evaluate((element) => parseFloat(getComputedStyle(element).animationDuration))).toBeLessThan(.01)
  const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const touchPage = await touchContext.newPage()
  await routeDirectory(touchPage)
  await touchPage.goto('http://127.0.0.1:5174')
  await add(touchPage, network.a.api)
  const before = await touchPage.locator('.chain-world').getAttribute('style')
  const cdp = await touchContext.newCDPSession(touchPage)
  await touchPage.locator('.chain-canvas').scrollIntoViewIfNeeded()
  const canvas = await touchPage.locator('.chain-canvas').boundingBox()
  const x = canvas!.x + 20, y = canvas!.y + 30
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  for (let offset = 20; offset <= 100; offset += 20) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + offset, y }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  expect(await touchPage.locator('.chain-world').getAttribute('style')).not.toBe(before)
  await touchContext.close()
})

test('千区块裁剪、重复刷新不重建区块元素及性能轨迹', async ({ page, context }) => {
  const blocks = Array.from({ length: 1000 }, (_, index) => ({ index, hash: index.toString(16).padStart(64, '0'), previousHash: index === 0 ? '0' : (index - 1).toString(16).padStart(64, '0'), data: `仅用于自动化测试的第 ${index} 个区块`, timestamp: 1508270000000 + index, nonce: index }))
  await page.route(`${network.a.api}/blocks`, (route) => route.fulfill({ json: blocks }))
  await page.goto('/')
  await add(page, network.a.api)
  await expect(page.locator('.height-readout')).toContainText('1000 个区块')
  expect(await page.locator('.chain-block').count()).toBeLessThan(20)
  await page.getByLabel('定位高度或完整 Hash').fill('500')
  await page.getByLabel('定位高度或完整 Hash').press('Enter')
  await expect(page.locator('.inspector .detail-index')).toHaveText('#500')
  const retained = await page.locator('[data-block-key="' + blocks[500]!.hash + '"]').elementHandle()
  await page.getByRole('button', { name: '刷新链', exact: true }).click()
  await expect(page.getByRole('button', { name: '刷新链', exact: true })).toBeEnabled()
  expect(await retained!.evaluate((element) => element.isConnected)).toBe(true)
  const session = await context.newCDPSession(page)
  const complete = new Promise<{ stream: string }>((resolve) => session.once('Tracing.tracingComplete', resolve))
  await session.send('Tracing.start', { categories: 'toplevel,devtools.timeline,blink.user_timing', transferMode: 'ReturnAsStream' })
  await page.locator('.chain-canvas').focus()
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight')
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '放大', exact: true }).click()
  const bounds = await page.locator('.chain-canvas').boundingBox()
  await page.mouse.move(bounds!.x + 20, bounds!.y + 30)
  await page.mouse.down()
  await page.mouse.move(bounds!.x + 180, bounds!.y + 50, { steps: 20 })
  await page.mouse.up()
  await session.send('Tracing.end')
  const { stream } = await complete
  let trace = ''
  while (true) { const part = await session.send('IO.read', { handle: stream }); trace += part.data; if (part.eof) break }
  await session.send('IO.close', { handle: stream })
  await fs.writeFile(`${artifacts}/thousand-blocks-trace.json`, trace)
  const events = JSON.parse(trace).traceEvents as { name: string; dur?: number }[]
  const tasks = events.filter((event) => /RunTask/.test(event.name) && event.dur).map((event) => (event.dur ?? 0) / 1000)
  const scriptTasks = events.filter((event) => event.name === 'FunctionCall' && event.dur).map((event) => (event.dur ?? 0) / 1000)
  expect(tasks.length + scriptTasks.length).toBeGreaterThan(0)
  await fs.writeFile(`${artifacts}/performance.json`, JSON.stringify({ dataset: '1000 个测试区块', renderedBlocks: await page.locator('.chain-block').count(), taskSamples: tasks.length, maxTaskMs: tasks.length ? Math.max(...tasks) : null, longTasks: tasks.length ? tasks.filter((duration) => duration > 50).length : null, maxScriptMs: Math.max(0, ...scriptTasks) }, null, 2))
})

test('真实节点退出、错误快照与同地址重启恢复', async ({ page }) => {
  let node = await startNode()
  directoryControl.node = node
  try {
    node.send('mine "重启前的真实数据"')
    await until(async () => (await node.blocks()).length === 2)
    await page.goto('/')
    await add(page, node.api)
    await expect(page.locator('.inspector .data-value')).toHaveText('重启前的真实数据')
    const { apiPort, p2pPort } = node
    await node.stop()
    await page.getByRole('button', { name: '刷新链', exact: true }).click()
    await expect(page.locator('.request-errors')).toContainText('无法访问 API')
    await expect(page.locator('.inspector .data-value')).toHaveText('重启前的真实数据')
    node = await startNode({ apiPort, p2pPort })
    await page.getByRole('button', { name: '立即重试', exact: true }).click()
    await expect(page.locator('.request-errors')).toHaveCount(0)
    await expect(page.locator('.inspector .detail-index')).toHaveText('#0')
    await expect(page.locator('.new-block-notice')).toContainText('链快照已变化')
  } finally { await node.stop() }
})

test('后端目录错误、超时与旧浏览器地址迁移', async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('blockchain-observatory:v1')) localStorage.setItem('blockchain-observatory:v1', JSON.stringify({ addresses: ['http://127.0.0.1:9999'], selected: 'http://127.0.0.1:9999', autoRefresh: true })) })
  directoryControl.status = 503
  await page.goto('/')
  await expect(page.locator('.request-errors')).toContainText('HTTP 503')
  await expect(page.locator('.node-tab')).toHaveCount(0)
  directoryControl.status = 200
  directoryControl.delay = 6000
  await page.getByRole('button', { name: '立即重试', exact: true }).click()
  await expect(page.locator('.request-errors')).toContainText('请求超时')
  directoryControl.delay = 0
  await page.getByRole('button', { name: '立即重试', exact: true }).click()
  await expect(page.locator('.endpoint')).toContainText(network.a.api)
  await expect(page.locator('.node-tab')).toHaveCount(1)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('blockchain-observatory:v1')!).addresses)).toBeUndefined()
  await page.getByRole('checkbox', { name: /自动刷新/ }).uncheck()
  await page.reload()
  await expect(page.locator('.endpoint')).toContainText(network.a.api)
  await expect(page.getByRole('checkbox', { name: /自动刷新/ })).not.toBeChecked()
})

test('快速切换隔离迟到响应，并恢复各节点视野和选择', async ({ page }) => {
  await page.goto('/')
  await add(page, network.a.api)
  await page.getByLabel('定位高度或完整 Hash').fill('0')
  await page.getByLabel('定位高度或完整 Hash').press('Enter')
  const aCamera = await page.locator('.chain-world').getAttribute('style')
  await add(page, network.b.api)
  await page.getByRole('button', { name: new RegExp(`节点 ${network.a.p2pPort}`) }).click()
  await expect(page.locator('.inspector .detail-index')).toHaveText('#0')
  expect(await page.locator('.chain-world').getAttribute('style')).toBe(aCamera)
  const raw = await network.a.blocks()
  await page.route(`${network.a.api}/blocks`, async (route) => { await new Promise((resolve) => setTimeout(resolve, 600)); await route.fulfill({ json: raw.map((block: object) => ({ ...block, data: '迟到的 A 快照' })) }).catch(() => {}) })
  await page.getByRole('button', { name: '刷新链', exact: true }).click()
  await page.getByRole('button', { name: new RegExp(`节点 ${network.b.p2pPort}`) }).click()
  await expect(page.locator('.endpoint')).toContainText(network.b.api)
  await expect(page.locator('.inspector .data-value')).not.toHaveText('迟到的 A 快照')
  await page.waitForTimeout(700)
  await expect(page.locator('.inspector .data-value')).not.toHaveText('迟到的 A 快照')
})

test('长文本与桌面 200% 等效 CSS 视口', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 720, height: 540 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  const raw = await network.a.blocks()
  raw[raw.length - 1].data = '区块链长文本与emoji测试🧭'.repeat(2000)
  await page.route(`${network.a.api}/blocks`, (route) => route.fulfill({ json: raw }))
  await routeDirectory(page)
  await page.goto('http://127.0.0.1:5174')
  await add(page, network.a.api)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('button', { name: /检查区块/ }).click()
  await expect(page.getByRole('dialog').locator('.data-length')).toContainText('字符')
  expect(await page.getByRole('dialog').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.getByRole('dialog').getByRole('button', { name: '展开完整数据' }).click()
  await expect(page.getByRole('dialog').locator('.data-value')).toHaveClass(/expanded/)
  await page.getByRole('dialog').evaluate(async (element) => { await Promise.allSettled(element.getAnimations().map((animation) => animation.finished)) })
  await page.screenshot({ path: `${artifacts}/zoom-equivalent-200.png`, animations: 'disabled' })
  await context.close()
})


test('后端增删目录自动更新，前端没有管理入口', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.node-tab')).toHaveCount(1)
  await expect(page.getByRole('button', { name: /添加节点|移除此观测地址/ })).toHaveCount(0)
  await expect(page.locator('input[type="url"]')).toHaveCount(0)
  network.a.send(`observe ${network.b.api}`)
  await expect(page.locator('.node-tab')).toHaveCount(2)
  await page.locator('.node-observer').screenshot({ path: `${artifacts}/backend-managed-nodes.png`, animations: 'disabled' })
  await page.getByRole('button', { name: new RegExp(`节点 ${network.b.p2pPort}`) }).click()
  await expect(page.locator('.endpoint')).toContainText(network.b.api)
  network.a.send(`unobserve ${network.b.api}`)
  await expect(page.locator('.node-tab')).toHaveCount(1)
  await expect(page.locator('.endpoint')).toContainText(network.a.api)
  await page.getByRole('button', { name: '1 个对等连接' }).click()
  await expect(page.locator('.peer-list')).toContainText(String(network.b.p2pPort))
})
