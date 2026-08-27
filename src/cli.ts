// agent_plugin_dev/host-plugin/src/cli.ts
import { fileURLToPath } from 'node:url'
import { spawnSync, spawn, execFileSync } from 'node:child_process'
import { loadConfig } from './config.ts'
import { parseListeningPids, portInUse, taskkillPid } from './win.ts'
import type { CliContext } from './types.ts'

export const description = 'Host 服务器管理:go(启动)/close(关闭)'

export async function main(args: string[], ctx: CliContext): Promise<number> {
  const [sub, ...rest] = args
  if (rest.length > 0) {
    ctx.io.stderr(`unknown flag: ${rest.join(' ')}`)
    return 1
  }
  switch (sub) {
    case 'go': return go(ctx)
    case 'close': return close(ctx)
    default:
      ctx.io.stderr(`unknown flag: ${args.join(' ')}`)
      return 1
  }
}

function requireStHome(ctx: CliContext): string {
  const stHome = ctx.env.ST_HOME
  if (!stHome) throw new Error('ST_HOME 未设置(检查根目录 .env)')
  return stHome
}

async function go(ctx: CliContext): Promise<number> {
  try {
    const stHome = requireStHome(ctx)
    const profile = ctx.env.ST_PROFILE ?? 'default'
    const cfg = loadConfig(stHome, profile)
    if (portInUse(cfg.port)) {
      ctx.io.stderr(`错误: 端口 ${cfg.port} 已被占用`)
      return 1
    }
    const serverPath = fileURLToPath(new URL('./server.ts', import.meta.url))
    const env = {
      ...process.env,
      ST_HOST_HOST: cfg.host,
      ST_HOST_PORT: String(cfg.port),
      ST_HOST_LISTEN: String(cfg.listen),
      ST_HOST_LISTEN_WHITELIST: JSON.stringify(cfg.listenWhitelist),
      ST_HOST_OPEN: String(cfg.open),
    }
    if (cfg.show) {
      // 独立终端窗口:start "Host" cmd /k node <server.ts>
      const r = spawnSync('cmd', ['/c', 'start', '"Host"', 'cmd', '/k', 'node', serverPath], {
        env,
        cwd: process.cwd(),
        stdio: 'ignore',
      })
      if (r.error) {
        ctx.io.stderr(`错误: 启动 Host 窗口失败 ${r.error.message}`)
        return 1
      }
    } else {
      // 隐藏后台进程
      const child = spawn('node', [serverPath], { env, stdio: 'ignore', windowsHide: true, detached: true })
      child.unref()
    }
    ctx.io.stdout(`Host 已启动: http://${cfg.host}:${cfg.port}`)
    return 0
  } catch (e) {
    ctx.io.stderr(`错误: ${e instanceof Error ? e.message : String(e)}`)
    return 1
  }
}

async function close(ctx: CliContext): Promise<number> {
  try {
    const stHome = requireStHome(ctx)
    const profile = ctx.env.ST_PROFILE ?? 'default'
    const cfg = loadConfig(stHome, profile)
    const out = execFileSync('netstat', ['-ano'], { encoding: 'utf8' })
    const pids = parseListeningPids(out, cfg.port)
    if (pids.length === 0) {
      ctx.io.stderr(`端口 ${cfg.port} 未在监听`)
      return 1
    }
    for (const pid of pids) taskkillPid(pid)
    ctx.io.stdout(`已关闭端口 ${cfg.port} 的 ${pids.length} 个进程`)
    return 0
  } catch (e) {
    ctx.io.stderr(`错误: ${e instanceof Error ? e.message : String(e)}`)
    return 1
  }
}
