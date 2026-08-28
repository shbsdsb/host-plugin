// agent_plugin_dev/host-plugin/src/index.ts
import { execFileSync } from 'node:child_process'
import { Context } from 'cordis'
import { loadConfig, DEFAULT_CONFIG, resolveListenTarget } from './config.ts'
import type { HostConfig } from './config.ts'
import { WebServerService } from './web-server.ts'

declare module 'cordis' {
  interface Context {
    /** host service 骨架(配置) */
    host: { config: HostConfig }
    /** host 提供的 HTTP 路由服务:其他插件通过 inject: ['webserver'] 注册路由 */
    webserver: WebServerService
  }
}

export const name = 'host'

export function apply(ctx: Context) {
  const stHome = process.env.ST_HOME ?? ''
  const profile = process.env.ST_PROFILE ?? 'default'
  const config = stHome ? loadConfig(stHome, profile) : { ...DEFAULT_CONFIG }
  ctx.provide('host', { config })

  const webserver = new WebServerService()
  ctx.provide('webserver', webserver)
  ctx.effect(() => async () => {
    await webserver.stop()
  })

  // st host go 前台运行时由 CLI 注入 ST_HOST_START=true:启动 HTTP 服务并保持进程
  if (process.env.ST_HOST_START === 'true') {
    return (async () => {
      const target = resolveListenTarget(config)
      try {
        await webserver.start(config.port, target)
      } catch (error) {
        console.error(`Host 启动失败: ${error instanceof Error ? error.message : String(error)}`)
        process.exit(1)
      }
      ctx.logger.info(`Host listening on http://${target}:${config.port}`)
      if (config.open) {
        try {
          execFileSync('cmd', ['/c', 'start', '', `http://${target}:${config.port}`], { stdio: 'ignore' })
        } catch {
          // 浏览器打开失败不阻塞服务
        }
      }
    })()
  }
}
