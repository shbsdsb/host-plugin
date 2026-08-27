// agent_plugin_dev/host-plugin/src/server.ts
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { HostConfig } from './config.ts'

/** 基础响应服务器:所有请求返回 'Host'(路由/静态文件后续迭代) */
export function buildServer(_cfg: HostConfig) {
  return createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('Host')
  })
}

/** listen/listenWhitelist 语义 → 监听地址 */
export function resolveListenTarget(cfg: HostConfig): string {
  if (!cfg.listen) return cfg.host
  if (cfg.listenWhitelist.length > 0) return cfg.listenWhitelist[0]
  return '0.0.0.0'
}

// 后台进程入口:读 ST_HOST_* env 启动服务(与 bootstrap 相同的 type-stripping 直跑)
const isMain = process.argv[1] &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  let port = Number(process.env.ST_HOST_PORT ?? 3000)
  if (!Number.isInteger(port) || port < 1 || port > 65535) port = 3000
  let listenWhitelist: string[] = []
  try {
    const raw = JSON.parse(process.env.ST_HOST_LISTEN_WHITELIST ?? '[]')
    if (Array.isArray(raw) && raw.every((x) => typeof x === 'string')) listenWhitelist = raw
  } catch {
    // 非法 JSON 用空白名单
  }
  const cfg: HostConfig = {
    host: process.env.ST_HOST_HOST ?? '127.0.0.1',
    port,
    listen: process.env.ST_HOST_LISTEN === 'true',
    listenWhitelist,
    open: process.env.ST_HOST_OPEN !== 'false',
    show: false,
  }
  const target = resolveListenTarget(cfg)
  const server = buildServer(cfg)
  server.on('error', (err: NodeJS.ErrnoException) => {
    console.error(`Host 启动失败: ${err.message}`)
    process.exit(1)
  })
  server.listen(cfg.port, target, () => {
    console.log(`Host listening on http://${target}:${cfg.port}`)
    if (cfg.open) {
      try {
        execFileSync('cmd', ['/c', 'start', '', `http://${target}:${cfg.port}`], { stdio: 'ignore' })
      } catch {
        // 浏览器打开失败不阻塞服务
      }
    }
  })
}
