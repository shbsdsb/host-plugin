// agent_plugin_dev/host-plugin/tests/index.spec.ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { name, apply } from '../src/index.ts'

function makeCtx(config = {}): { host: { config: unknown }; on: ReturnType<typeof vi.fn>; effect: ReturnType<typeof vi.fn> } {
  return { host: { config: {} }, on: vi.fn(), effect: vi.fn() }
}

describe('host plugin', () => {
  beforeEach(() => {
    delete process.env.ST_HOME
    delete process.env.ST_PROFILE
  })

  it('导出插件名 host', () => {
    expect(name).toBe('host')
  })

  it('apply 注册 ctx.host 骨架(默认配置)', () => {
    const ctx = makeCtx() as never
    apply(ctx as never)
    expect((ctx as { host: { config: unknown } }).host).toBeDefined()
    expect((ctx as { host: { config: { port: number } } }).host.config.port).toBe(3000)
  })

  it('apply 读取 $ST_HOME patch 覆盖配置', async () => {
    const stHome = await mkdtemp(resolve(tmpdir(), 'st-host-'))
    await mkdir(resolve(stHome, 'profile/default'), { recursive: true })
    await writeFile(join(stHome, 'profile/default/cordis.patch.yml'), '- id: host\n  config:\n    port: 8080\n')
    process.env.ST_HOME = stHome
    const ctx = makeCtx() as never
    apply(ctx as never)
    expect((ctx as { host: { config: { port: number } } }).host.config.port).toBe(8080)
  })
})
