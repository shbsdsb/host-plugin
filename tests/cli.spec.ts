// agent_plugin_dev/host-plugin/tests/cli.spec.ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { main } from '../src/cli.ts'
import type { CliContext } from '../src/types.ts'

vi.mock('../src/win.ts', () => ({
  portInUse: vi.fn(() => false),
  taskkillPid: vi.fn(),
  parseListeningPids: vi.fn(() => [12345]),
}))

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0 })),
  spawn: vi.fn(() => ({ unref: vi.fn() })),
  execFileSync: vi.fn(() => ''),
}))

import { spawnSync, spawn, execFileSync } from 'node:child_process'
import { portInUse, taskkillPid, parseListeningPids } from '../src/win.ts'
const mockSpawnSync = vi.mocked(spawnSync)
const mockSpawn = vi.mocked(spawn)
const mockExecFileSync = vi.mocked(execFileSync)
const mockPortInUse = vi.mocked(portInUse)
const mockTaskkill = vi.mocked(taskkillPid)
const mockParse = vi.mocked(parseListeningPids)

async function makeStHome(): Promise<string> {
  const dir = await mkdtemp(resolve(tmpdir(), 'st-host-'))
  await mkdir(resolve(dir, 'profile/default'), { recursive: true })
  await writeFile(join(dir, 'profile/default/cordis.patch.yml'), '- id: host\n  config:\n    port: 3000\n')
  return dir
}

function makeCtx(stHome: string): { ctx: CliContext; out: string[]; err: string[] } {
  const out: string[] = []
  const err: string[] = []
  return {
    ctx: { env: { ST_HOME: stHome }, io: { stdout: (s) => out.push(s), stderr: (s) => err.push(s) } },
    out,
    err,
  }
}

describe('host main', () => {
  beforeEach(() => {
    mockPortInUse.mockReset(); mockTaskkill.mockReset(); mockParse.mockReset()
    mockSpawnSync.mockReset(); mockSpawn.mockReset(); mockExecFileSync.mockReset()
    mockSpawnSync.mockReturnValue({ status: 0 } as never)
    mockSpawn.mockReturnValue({ unref: vi.fn() } as never)
    mockExecFileSync.mockReturnValue('')
  })

  it('未知子命令报 unknown flag', async () => {
    const stHome = await makeStHome()
    const { ctx, err } = makeCtx(stHome)
    expect(await main(['foo'], ctx)).toBe(1)
    expect(err.join('\n')).toBe('unknown flag: foo')
  })

  it('go 前探测端口占用,占用则报错 exit 1', async () => {
    const stHome = await makeStHome()
    mockPortInUse.mockReturnValue(true)
    const { ctx, err } = makeCtx(stHome)
    expect(await main(['go'], ctx)).toBe(1)
    expect(err.join('\n')).toContain('已被占用')
  })

  it('go 成功:show=true 走 start 窗口分支,输出启动信息', async () => {
    const stHome = await makeStHome()
    const { ctx, out, err } = makeCtx(stHome)
    expect(await main(['go'], ctx)).toBe(0)
    expect(mockSpawnSync).toHaveBeenCalledWith(
      'cmd',
      expect.arrayContaining(['start', '"Host"']),
      expect.anything(),
    )
    expect(mockSpawn).not.toHaveBeenCalled() // show=true 不 spawn 隐藏进程
    expect(out.join('\n')).toContain('Host 已启动')
    expect(err).toEqual([])
  })

  it('go show=false 走隐藏后台 spawn 分支', async () => {
    const stHome = await makeStHome()
    await writeFile(join(stHome, 'cordis.patch.yml'), '- id: host\n  config:\n    show: false\n')
    const { ctx, out } = makeCtx(stHome)
    expect(await main(['go'], ctx)).toBe(0)
    expect(mockSpawnSync).not.toHaveBeenCalled()
    expect(mockSpawn).toHaveBeenCalledWith('node', expect.anything(), expect.objectContaining({ windowsHide: true }))
    expect(out.join('\n')).toContain('Host 已启动')
  })

  it('close:解析 netstat PID 并逐个 taskkill', async () => {
    const stHome = await makeStHome()
    mockParse.mockReturnValue([12345, 54321])
    const { ctx, out, err } = makeCtx(stHome)
    expect(await main(['close'], ctx)).toBe(0)
    expect(mockParse).toHaveBeenCalledWith(expect.any(String), 3000)
    expect(mockTaskkill).toHaveBeenCalledTimes(2)
    expect(out.join('\n')).toContain('已关闭端口 3000')
    expect(err).toEqual([])
  })

  it('close:端口未监听报错 exit 1', async () => {
    const stHome = await makeStHome()
    mockParse.mockReturnValue([])
    const { ctx, err } = makeCtx(stHome)
    expect(await main(['close'], ctx)).toBe(1)
    expect(err.join('\n')).toContain('未在监听')
  })

  it('ST_HOME 缺失报错', async () => {
    const { ctx, err } = makeCtx('')
    ctx.env.ST_HOME = undefined
    expect(await main(['go'], ctx)).toBe(1)
    expect(err.join('\n')).toContain('ST_HOME 未设置')
  })
})
