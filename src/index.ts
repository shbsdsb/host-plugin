// agent_plugin_dev/host-plugin/src/index.ts
import { Context } from 'cordis'
import { loadConfig, DEFAULT_CONFIG } from './config.ts'
import type { HostConfig } from './config.ts'

declare module 'cordis' {
  interface Context {
    /** host service 骨架(路由注册等后续迭代扩展) */
    host: { config: HostConfig }
  }
}

export const name = 'host'

export function apply(ctx: Context) {
  const stHome = process.env.ST_HOME ?? ''
  const profile = process.env.ST_PROFILE ?? 'default'
  const config = stHome ? loadConfig(stHome, profile) : { ...DEFAULT_CONFIG }
  ctx.host = { config }
  ctx.effect(() => () => {}) // 占位清理(骨架)
}
