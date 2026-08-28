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
  execFileSync: vi.fn(() => ''),
}))

import { spawnSync, execFileSync } from 'node:child_process'
import { portInUse, taskkillPid, parseListeningPids } from '../src/win.ts'
const mockSpawnSync = vi.mocked(spawnSync)
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
    mockSpawnSync.mockReset(); mockExecFileSync.mockReset()
    mockSpawnSync.mockReturnValue({ status: 0 } as never)
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

  it('go 前台阻塞运行 bootstrap(stdio inherit,ST_HOST_START=true,透传退出码)', async () => {
    const stHome = await makeStHome()
    const { ctx, out } = makeCtx(stHome)
    ctx.env.ST_BOOTSTRAP = 'D:/x/bootstrap/src/index.ts'
    mockSpawnSync.mockReturnValue({ status: 3 } as never)
    expect(await main(['go'], ctx)).toBe(3)
    expect(mockSpawnSync).toHaveBeenCalledWith(
      'node',
      ['D:/x/bootstrap/src/index.ts'],
      expect.objectContaining({ stdio: 'inherit' }),
    )
    const env = (mockSpawnSync.mock.calls[0][2] as { env: Record<string, string> }).env
    expect(env.ST_HOST_START).toBe('true')
    expect(env.ST_HOST_PORT).toBe('3000')
    expect(out.join('\n')).toBe('')
  })

  it('go ST_BOOTSTRAP 缺失报错 exit 1', async () => {
    const stHome = await makeStHome()
    const { ctx, err } = makeCtx(stHome)
    expect(await main(['go'], ctx)).toBe(1)
    expect(err.join('\n')).toContain('ST_BOOTSTRAP')
  })

  it('go 透传 ctx.env(含 .env 的 ST_HOME/ST_PROFILE)给子进程', async () => {
    const stHome = await makeStHome()
    delete process.env.ST_HOME // 模拟 ST_HOME 仅存在于 .env(loadEnv 并入 ctx.env,不写回 process.env)
    delete process.env.ST_PROFILE
    const { ctx } = makeCtx(stHome)
    ctx.env.ST_BOOTSTRAP = 'D:/x/bootstrap/src/index.ts'
    ctx.env.ST_PROFILE = 'prod'
    expect(await main(['go'], ctx)).toBe(0)
    const env = (mockSpawnSync.mock.calls[0][2] as { env: Record<string, string> }).env
    expect(env.ST_HOME).toBe(stHome)
    expect(env.ST_PROFILE).toBe('prod')
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
