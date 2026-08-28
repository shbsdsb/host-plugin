// agent_plugin_dev/host-plugin/tests/webserver.spec.ts
import { describe, expect, it, vi, afterEach } from 'vitest'
import { WebserverService } from '../src/webserver.ts'

async function startOnEphemeralPort(ws: WebserverService): Promise<string> {
  await ws.start(0, '127.0.0.1')
  const { port } = ws.server.address() as { port: number }
  return `http://127.0.0.1:${port}`
}

describe('WebserverService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('get/post/all 路由注册与匹配,未命中 404', async () => {
    const ws = new WebserverService()
    ws.get('/hello', (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('hi')
    })
    ws.post('/echo', (_req, res) => {
      res.writeHead(200)
      res.end('post-ok')
    })
    ws.all('/any', (_req, res) => {
      res.writeHead(200)
      res.end('any-ok')
    })
    const base = await startOnEphemeralPort(ws)
    try {
      expect(await (await fetch(base + '/hello')).text()).toBe('hi')
      expect(await (await fetch(base + '/echo', { method: 'POST' })).text()).toBe('post-ok')
      expect((await fetch(base + '/echo')).status).toBe(404) // 方法不匹配
      expect(await (await fetch(base + '/any', { method: 'PUT' })).text()).toBe('any-ok')
      expect((await fetch(base + '/nope')).status).toBe(404) // 路径不匹配
    } finally {
      await ws.stop()
    }
  })

  it('handler 抛错 → 500', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const ws = new WebserverService()
    ws.get('/boom', () => {
      throw new Error('boom')
    })
    const base = await startOnEphemeralPort(ws)
    try {
      const res = await fetch(base + '/boom')
      expect(res.status).toBe(500)
    } finally {
      await ws.stop()
      spy.mockRestore()
    }
  })

  it('start/stop 生命周期与 listening 状态;未 start 时 stop 无害', async () => {
    const ws = new WebserverService()
    expect(ws.listening).toBe(false)
    await ws.stop() // 未监听时 stop 不抛
    await ws.start(0, '127.0.0.1')
    expect(ws.listening).toBe(true)
    await ws.stop()
    expect(ws.listening).toBe(false)
  })

  it('端口占用时 start reject', async () => {
    const a = new WebserverService()
    await a.start(0, '127.0.0.1')
    const { port } = a.server.address() as { port: number }
    const b = new WebserverService()
    try {
      await expect(b.start(port, '127.0.0.1')).rejects.toThrow()
    } finally {
      await a.stop()
      await b.stop()
    }
  })
})
