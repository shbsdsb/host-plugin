// agent_plugin_dev/host-plugin/tests/index.spec.ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { name, apply } from '../src/index.ts'
import { WebserverService } from '../src/webserver.ts'

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}))

vi.mock('../src/webserver.ts', () => {
  const start = vi.fn().mockResolvedValue(undefined)
  const stop = vi.fn().mockResolvedValue(undefined)
  class FakeWebserverService {
    start = start
    stop = stop
    get listening() { return false }
    get server() { return { address: () => ({ port: 0 }) } }
  }
  return { WebserverService: FakeWebserverService }
})

import { execFileSync } from 'node:child_process'

function makeCtx(config = {}): {
  host: { config: unknown }
  provide: ReturnType<typeof vi.fn>
  effect: ReturnType<typeof vi.fn>
} {
  return { host: { config: {} }, provide: vi.fn(() => () => {}), effect: vi.fn() }
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
    expect((ctx as { host: { config: unknown } }).host).toBeDefined()
    expect((ctx as { provide: ReturnType<typeof vi.fn> }).provide).toHaveBeenCalledWith('webserver', expect.any(WebserverService))
  })

  it('apply 读取 $ST_HOME patch 覆盖配置', async () => {
    const stHome = await makeStHome()
    process.env.ST_HOME = stHome
    const ctx = makeCtx() as never
    apply(ctx as never)
    expect((ctx as { host: { config: { port: number } } }).host.config.port).toBe(8080)
  })

  it('ST_HOST_START=true 时启动 webserver(端口/地址来自配置)', async () => {
    const stHome = await makeStHome()
    process.env.ST_HOME = stHome
    process.env.ST_HOST_START = 'true'
    const ctx = makeCtx() as never
    const ret = apply(ctx as never)
    if (ret && typeof (ret as Promise<unknown>).then === 'function') await ret
    const instance = (ctx as { provide: ReturnType<typeof vi.fn> }).provide.mock.calls[0][1] as {
      start: ReturnType<typeof vi.fn>
    }
    expect(instance.start).toHaveBeenCalledWith(8080, '127.0.0.1')
    expect(vi.mocked(execFileSync)).toHaveBeenCalled() // open 打开浏览器
  })

  it('未设置 ST_HOST_START 时不启动 webserver', () => {
    delete process.env.ST_HOME
    const ctx = makeCtx() as never
    apply(ctx as never)
    const instance = (ctx as { provide: ReturnType<typeof vi.fn> }).provide.mock.calls[0][1] as {
      start: ReturnType<typeof vi.fn>
    }
    expect(instance.start).not.toHaveBeenCalled()
  })
})
