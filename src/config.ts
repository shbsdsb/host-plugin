// agent_plugin_dev/host-plugin/src/config.ts
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as yaml from 'js-yaml'

export interface HostConfig {
  host: string
  port: number
  listen: boolean
  listenWhitelist: string[]
  open: boolean
}

export const DEFAULT_CONFIG: HostConfig = {
  host: '127.0.0.1',
  port: 3000,
  listen: false,
  listenWhitelist: [],
  open: true,
}

/** listen/listenWhitelist 语义 → 监听地址 */
export function resolveListenTarget(cfg: HostConfig): string {
  if (!cfg.listen) return cfg.host
  if (cfg.listenWhitelist.length > 0) return cfg.listenWhitelist[0]
  return '0.0.0.0'
}

export function normalizeConfig(raw: Record<string, unknown> | undefined): HostConfig {
  const cfg: HostConfig = { ...DEFAULT_CONFIG }
  if (!raw) return cfg
  if (typeof raw.host === 'string') cfg.host = raw.host
  if (typeof raw.port === 'number' && Number.isInteger(raw.port) && raw.port >= 1 && raw.port <= 65535) {
    cfg.port = raw.port
  }
  if (typeof raw.listen === 'boolean') cfg.listen = raw.listen
  if (Array.isArray(raw.listenWhitelist) && raw.listenWhitelist.every((x) => typeof x === 'string')) {
    cfg.listenWhitelist = raw.listenWhitelist
  }
  if (typeof raw.open === 'boolean') cfg.open = raw.open
  return cfg
}

function readHostEntryConfig(patchPath: string): Record<string, unknown> | undefined {
  if (!existsSync(patchPath)) return undefined
  try {
    const entries = (yaml.load(readFileSync(patchPath, 'utf8'), { schema: yaml.JSON_SCHEMA }) ?? []) as unknown[]
    const entry = entries.find((e): e is Record<string, unknown> =>
      typeof e === 'object' && e !== null && (e as Record<string, unknown>).id === 'host')
    const config = entry?.config
    if (typeof config !== 'object' || config === null) return undefined
    return config as Record<string, unknown>
  } catch {
    return undefined
  }
}

/** 读 patch 中 id=host 条目的 config:profile 级 → user 级(后者覆盖前者) */
export function loadConfig(stHome: string, profile = 'default'): HostConfig {
  const merged: Record<string, unknown> = {}
  for (const patchPath of [
    join(stHome, 'profile', profile, 'cordis.patch.yml'),
    join(stHome, 'cordis.patch.yml'),
  ]) {
    const config = readHostEntryConfig(patchPath)
    if (config) Object.assign(merged, config)
  }
  return normalizeConfig(merged)
}
