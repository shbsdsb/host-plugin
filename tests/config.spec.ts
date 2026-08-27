// agent_plugin_dev/host-plugin/tests/config.spec.ts
import { describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { DEFAULT_CONFIG, normalizeConfig, loadConfig } from '../src/config.ts'

describe('normalizeConfig', () => {
  it('undefined 返回默认值', () => {
    expect(normalizeConfig(undefined)).toEqual(DEFAULT_CONFIG)
  })

  it('合法字段生效,未出现字段用默认值', () => {
    expect(normalizeConfig({ port: 8080, listen: true }))
      .toEqual({ ...DEFAULT_CONFIG, port: 8080, listen: true })
  })

  it('port 越界/非整数回退默认值', () => {
    expect(normalizeConfig({ port: 0 }).port).toBe(3000)
    expect(normalizeConfig({ port: 70000 }).port).toBe(3000)
    expect(normalizeConfig({ port: 1.5 }).port).toBe(3000)
    expect(normalizeConfig({ port: '3000' }).port).toBe(3000)
  })

  it('类型不符回退默认值', () => {
    expect(normalizeConfig({ host: 123 }).host).toBe('127.0.0.1')
    expect(normalizeConfig({ listen: 'yes' }).listen).toBe(false)
    expect(normalizeConfig({ listenWhitelist: [1, 2] }).listenWhitelist).toEqual([])
    expect(normalizeConfig({ open: 'yes' }).open).toBe(true)
    expect(normalizeConfig({ show: 0 }).show).toBe(true)
  })
})

describe('loadConfig', () => {
  async function makeStHome(): Promise<string> {
    const dir = await mkdtemp(resolve(tmpdir(), 'st-host-'))
    await mkdir(resolve(dir, 'profile/default'), { recursive: true })
    return dir
  }

  it('无 patch 时纯默认值', async () => {
    const stHome = await makeStHome()
    expect(loadConfig(stHome, 'default')).toEqual(DEFAULT_CONFIG)
  })

  it('profile 级 config 覆盖', async () => {
    const stHome = await makeStHome()
    await writeFile(join(stHome, 'profile/default/cordis.patch.yml'), [
      '- id: host',
      '  config:',
      '    port: 8080',
    ].join('\n'))
    expect(loadConfig(stHome, 'default').port).toBe(8080)
  })

  it('user 级覆盖 profile 级', async () => {
    const stHome = await makeStHome()
    await writeFile(join(stHome, 'profile/default/cordis.patch.yml'), [
      '- id: host',
      '  config:',
      '    port: 8080',
      '    host: 0.0.0.0',
    ].join('\n'))
    await writeFile(join(stHome, 'cordis.patch.yml'), [
      '- id: host',
      '  config:',
      '    port: 9090',
    ].join('\n'))
    const cfg = loadConfig(stHome, 'default')
    expect(cfg.port).toBe(9090) // user 覆盖 port
    expect(cfg.host).toBe('0.0.0.0') // profile 的 host 保留
  })

  it('patch 无 host 条目时纯默认值', async () => {
    const stHome = await makeStHome()
    await writeFile(join(stHome, 'profile/default/cordis.patch.yml'), '- id: other\n  name: "./x.ts"\n')
    expect(loadConfig(stHome, 'default')).toEqual(DEFAULT_CONFIG)
  })

  it('缺省 profile 为 default', async () => {
    const stHome = await makeStHome()
    await writeFile(join(stHome, 'profile/default/cordis.patch.yml'), '- id: host\n  config:\n    port: 3001\n')
    expect(loadConfig(stHome).port).toBe(3001)
  })
})
