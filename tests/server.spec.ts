// agent_plugin_dev/host-plugin/tests/server.spec.ts
import { describe, expect, it } from 'vitest'
import { buildServer, resolveListenTarget } from '../src/server.ts'
import { DEFAULT_CONFIG } from '../src/config.ts'

describe('resolveListenTarget', () => {
  it('listen=false 用 cfg.host', () => {
    expect(resolveListenTarget({ ...DEFAULT_CONFIG, host: '192.168.1.5' })).toBe('192.168.1.5')
  })

  it('listen=true 且 whitelist 非空用第一个接口', () => {
    expect(resolveListenTarget({ ...DEFAULT_CONFIG, listen: true, listenWhitelist: ['192.168.1.5', '10.0.0.2'] }))
      .toBe('192.168.1.5')
  })

  it('listen=true 且 whitelist 空用 0.0.0.0', () => {
    expect(resolveListenTarget({ ...DEFAULT_CONFIG, listen: true })).toBe('0.0.0.0')
  })
})

describe('buildServer', () => {
  it('返回可用的 http.Server,请求返回 Host 文本', async () => {
    const server = buildServer(DEFAULT_CONFIG)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const addr = server.address() as { port: number }
    const res = await fetch(`http://127.0.0.1:${addr.port}/`)
    expect(await res.text()).toBe('Host')
    await new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve()))
  })
})
