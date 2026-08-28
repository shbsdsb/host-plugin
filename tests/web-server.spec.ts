// agent_plugin_dev/host-plugin/tests/web-server.spec.ts
import { describe, expect, it, vi, afterEach } from 'vitest'
import { createConnection } from 'node:net'
import { WebServerService } from '../src/web-server.ts'

async function startOnEphemeralPort(ws: WebServerService): Promise<string> {
  await ws.start(0, '127.0.0.1')
  const { port } = ws.server.address() as { port: number }
  return `http://127.0.0.1:${port}`
}

describe('WebServerService 注册', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('register 返回 disposer;dispose 后可重新注册同 path', () => {
    const ws = new WebServerService()
    const dispose = ws.register({ kind: 'exact', path: '/a', handler: () => {} })
    expect(() => ws.register({ kind: 'exact', path: '/a', handler: () => {} })).toThrow(/已注册/)
    dispose()
    expect(() => ws.register({ kind: 'prefix', path: '/a', handler: () => {} })).not.toThrow()
    dispose() // 幂等
  })

  it('重复注册同一 path(不同 kind)报 409', () => {
    const ws = new WebServerService()
    ws.register({ kind: 'exact', path: '/api', handler: () => {} })
    try {
      ws.register({ kind: 'prefix', path: '/api', handler: () => {} })
      expect.unreachable('应抛错')
    } catch (e) {
      expect((e as { code?: number }).code).toBe(409)
    }
  })

  it('fallback 全局唯一,重复注册报 409;dispose 后可再注册', () => {
    const ws = new WebServerService()
    const dispose = ws.registerFallback({ handler: () => {} })
    try {
      ws.registerFallback({ handler: () => {} })
      expect.unreachable('应抛错')
    } catch (e) {
      expect((e as { code?: number }).code).toBe(409)
    }
    dispose()
    expect(() => ws.registerFallback({ handler: () => {} })).not.toThrow()
  })

  it('参数非法报 400(kind 非字面量/path 非字符串/handler 非函数)', () => {
    const ws = new WebServerService()
    const cases: unknown[] = [
      { kind: 'regex', path: '/a', handler: () => {} },
      { kind: 'exact', path: 42, handler: () => {} },
      { kind: 'exact', path: '/a', handler: 'not-fn' },
      { kind: 'exact', path: '', handler: () => {} },
      null,
    ]
    for (const c of cases) {
      try {
        ws.register(c as never)
        expect.unreachable('应抛错')
      } catch (e) {
        expect((e as { code?: number }).code).toBe(400)
      }
    }
    try {
      ws.registerFallback({ handler: 'not-fn' } as never)
      expect.unreachable('应抛错')
    } catch (e) {
      expect((e as { code?: number }).code).toBe(400)
    }
  })
})

describe('WebServerService 分发(exact / 最长 prefix / fallback)', () => {
  it('exact 命中;路径不匹配 404', async () => {
    const ws = new WebServerService()
    ws.register({ kind: 'exact', path: '/hello', handler: (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('hi')
    } })
    const base = await startOnEphemeralPort(ws)
    try {
      expect(await (await fetch(base + '/hello')).text()).toBe('hi')
      expect((await fetch(base + '/nope')).status).toBe(404)
      expect((await fetch(base + '/hello/sub')).status).toBe(404) // exact 不匹配子路径
    } finally {
      await ws.stop()
    }
  })

  it('handler 抛错 → 500', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const ws = new WebServerService()
    ws.register({ kind: 'exact', path: '/boom', handler: () => { throw new Error('boom') } })
    const base = await startOnEphemeralPort(ws)
    try {
      expect((await fetch(base + '/boom')).status).toBe(500)
    } finally {
      await ws.stop()
      spy.mockRestore()
    }
  })

  it('start/stop 生命周期与 listening 状态;未 start 时 stop 无害', async () => {
    const ws = new WebServerService()
    expect(ws.listening).toBe(false)
    await ws.stop()
    await ws.start(0, '127.0.0.1')
    expect(ws.listening).toBe(true)
    await ws.stop()
    expect(ws.listening).toBe(false)
  })

  it('端口占用时 start reject', async () => {
    const a = new WebServerService()
    await a.start(0, '127.0.0.1')
    const { port } = a.server.address() as { port: number }
    const b = new WebServerService()
    try {
      await expect(b.start(port, '127.0.0.1')).rejects.toThrow()
    } finally {
      await a.stop()
      await b.stop()
    }
  })

  it('畸形 URL → 400(不崩溃进程)', async () => {
    const ws = new WebServerService()
    const base = await startOnEphemeralPort(ws)
    const { port } = ws.server.address() as { port: number }
    try {
      const status = await new Promise<number>((resolve, reject) => {
        const sock = createConnection({ port, host: '127.0.0.1' }, () => {
          sock.write('GET http://[::1 HTTP/1.1\r\nHost: x\r\n\r\n')
        })
        let data = ''
        sock.on('data', (d) => {
          data += d.toString()
          const m = data.match(/^HTTP\/1\.1 (\d+)/)
          if (m) {
            sock.destroy()
            resolve(Number(m[1]))
          }
        })
        sock.on('error', reject)
        setTimeout(() => { sock.destroy(); resolve(0) }, 1000)
      })
      expect(status).toBe(400)
      expect((await fetch(base + '/nope')).status).toBe(404)
    } finally {
      await ws.stop()
    }
  })

  it('handler async reject → 500;headers 已发后抛错 → 销毁连接而非 500', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const ws = new WebServerService()
    ws.register({ kind: 'exact', path: '/async-boom', handler: async () => { throw new Error('async-boom') } })
    ws.register({ kind: 'exact', path: '/partial', handler: (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.write('partial')
      throw new Error('boom-after-headers')
    } })
    const base = await startOnEphemeralPort(ws)
    try {
      expect((await fetch(base + '/async-boom')).status).toBe(500)
      const res = await fetch(base + '/partial').catch(() => null)
      if (res) expect(res.status).not.toBe(500)
    } finally {
      await ws.stop()
      spy.mockRestore()
    }
  })

  it('prefix 路径段边界 + 最长匹配;exact/prefix/fallback 优先级', async () => {
    const ws = new WebServerService()
    ws.register({ kind: 'exact', path: '/api/exact', handler: (_req, res) => { res.writeHead(200); res.end('exact') } })
    ws.register({ kind: 'prefix', path: '/api', handler: (_req, res) => { res.writeHead(200); res.end('api') } })
    ws.register({ kind: 'prefix', path: '/api/v1', handler: (_req, res) => { res.writeHead(200); res.end('v1') } })
    ws.registerFallback({ handler: (_req, res) => { res.writeHead(200); res.end('fallback') } })
    const base = await startOnEphemeralPort(ws)
    try {
      expect(await (await fetch(base + '/api/exact')).text()).toBe('exact')   // exact 优先
      expect(await (await fetch(base + '/api/v1/model')).text()).toBe('v1')   // 最长 prefix
      expect(await (await fetch(base + '/api/user')).text()).toBe('api')      // 较短 prefix
      expect(await (await fetch(base + '/api')).text()).toBe('api')           // prefix 匹配自身
      expect(await (await fetch(base + '/apix')).text()).toBe('fallback')     // 路径段边界:/apix 不命中 /api → fallback(若越界匹配会返回 'api')
      expect(await (await fetch(base + '/other')).text()).toBe('fallback')    // 未命中 → fallback 兜底
    } finally {
      await ws.stop()
    }
  })

  it('fallback 兜底;disposer 移除后不再命中', async () => {
    const ws = new WebServerService()
    const disposeFallback = ws.registerFallback({ handler: (_req, res) => { res.writeHead(200); res.end('fallback') } })
    const disposePrefix = ws.register({ kind: 'prefix', path: '/gone', handler: (_req, res) => { res.writeHead(200); res.end('gone') } })
    const base = await startOnEphemeralPort(ws)
    try {
      expect(await (await fetch(base + '/anything')).text()).toBe('fallback')  // fallback 兜底
      expect(await (await fetch(base + '/gone/x')).text()).toBe('gone')        // prefix 命中
      disposePrefix()
      expect(await (await fetch(base + '/gone/x')).text()).toBe('fallback')    // 移除后不再命中 → fallback 兜底
      disposeFallback()
      expect((await fetch(base + '/gone/x')).status).toBe(404)                 // fallback 也移除后 → 404
    } finally {
      await ws.stop()
    }
  })
})
