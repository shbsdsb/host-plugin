// agent_plugin_dev/host-plugin/tests/index.spec.ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { Context } from 'cordis'
import { name, apply } from '../src/index.ts'
import { WebServerService } from '../src/web-server.ts'
import { DEFAULT_CONFIG } from '../src/config.ts'

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}))

vi.mock('../src/web-server.ts', () => {
  const start = vi.fn().mockResolvedValue(undefined)
  const stop = vi.fn().mockResolvedValue(undefined)
  class FakeWebServerService {
    start = start
    stop = stop
    get listening() { return false }
    get server() { return { address: () => ({ port: 0 }) } }
  }
  return { WebServerService: FakeWebServerService }
})

import { execFileSync } from 'node:child_process'

function makeCtx(config = {}): {
  host: { config: unknown }
  provide: ReturnType<typeof vi.fn>
  effect: ReturnType<typeof vi.fn>
  logger: { info: ReturnType<typeof vi.fn> }
} {
  return { host: { config: {} }, provide: vi.fn(() => () => {}), effect: vi.fn(), logger: { info: vi.fn() } }
}

async function makeStHome(extra = ''): Promise<string> {
  const dir = await mkdtemp(resolve(tmpdir(), 'st-host-'))
  await mkdir(resolve(dir, 'profile/default'), { recursive: true })
  await writeFile(join(dir, 'profile/default/cordis.patch.yml'), [
    '- id: host',
    '  config:',
    '    port: 8080',
    ...(extra ? ['    ' + extra] : []),
  ].join('\n'))
  return dir
}

describe('host plugin', () => {
  beforeEach(() => {
    delete process.env.ST_HOME
    delete process.env.ST_PROFILE
    delete process.env.ST_HOST_START
    vi.clearAllMocks()
  })

  it('导出插件名 host', () => {
    expect(name).toBe('host')
  })

  it('apply 注册 ctx.host 与 ctx.webserver(默认配置)', () => {
    const ctx = makeCtx() as never
    apply(ctx as never)
    expect((ctx as { provide: ReturnType<typeof vi.fn> }).provide).toHaveBeenCalledWith(
      'host',
      expect.objectContaining({ config: DEFAULT_CONFIG }),
    )
    expect((ctx as { provide: ReturnType<typeof vi.fn> }).provide).toHaveBeenCalledWith('webserver', expect.any(WebServerService))
  })

  it('apply 读取 $ST_HOME patch 覆盖配置', async () => {
    const stHome = await makeStHome()
    process.env.ST_HOME = stHome
    const ctx = makeCtx() as never
    apply(ctx as never)
    const hostCall = (ctx as { provide: ReturnType<typeof vi.fn> }).provide.mock.calls.find(([n]) => n === 'host')
    expect((hostCall?.[1] as { config: { port: number } }).config.port).toBe(8080)
  })

  it('在真实 cordis Context 上 apply 不抛错,host/webserver 可读', () => {
    const ctx = new Context()
    expect(() => apply(ctx as never)).not.toThrow()
    expect((ctx as unknown as { host: { config: { port: number } } }).host).toBeDefined()
    expect((ctx as unknown as { host: { config: { port: number } } }).host.config.port).toBe(3000)
    expect((ctx as unknown as { webserver: unknown }).webserver).toBeDefined()
    ctx.dispose?.()
  })

  it('ST_HOST_START=true 时启动 webserver(端口/地址来自配置)', async () => {
    const stHome = await makeStHome()
    process.env.ST_HOME = stHome
    process.env.ST_HOST_START = 'true'
    const ctx = makeCtx() as never
    const ret = apply(ctx as never)
    if (ret && typeof (ret as Promise<unknown>).then === 'function') await ret
    const wsCall = (ctx as { provide: ReturnType<typeof vi.fn> }).provide.mock.calls.find(([n]) => n === 'webserver')
    const instance = wsCall?.[1] as { start: ReturnType<typeof vi.fn> }
    expect(instance.start).toHaveBeenCalledWith(8080, '127.0.0.1')
    expect(vi.mocked(execFileSync)).toHaveBeenCalled() // open 打开浏览器
    expect((ctx as { logger: { info: ReturnType<typeof vi.fn> } }).logger.info).toHaveBeenCalledWith(
      'Host listening on http://127.0.0.1:8080',
    )
  })

  it('未设置 ST_HOST_START 时不启动 webserver', () => {
    delete process.env.ST_HOME
    const ctx = makeCtx() as never
    apply(ctx as never)
    const wsCall = (ctx as { provide: ReturnType<typeof vi.fn> }).provide.mock.calls.find(([n]) => n === 'webserver')
    const instance = wsCall?.[1] as { start: ReturnType<typeof vi.fn> }
    expect(instance.start).not.toHaveBeenCalled()
  })
})
