// agent_plugin_dev/host-plugin/tests/win.spec.ts
import { describe, expect, it } from 'vitest'
import { parseListeningPids } from '../src/win.ts'

describe('parseListeningPids', () => {
  const sample = [
    '',
    '  TCP    127.0.0.1:3000         0.0.0.0:0              LISTENING       12345',
    '  TCP    127.0.0.1:3001         0.0.0.0:0              LISTENING       99999',
    '  TCP    [::]:3000             [::]:0                 LISTENING       12345',
    '  TCP    0.0.0.0:3000          0.0.0.0:0              LISTENING       54321',
    '  TCP    127.0.0.1:3000         127.0.0.1:54321        ESTABLISHED     77777',
    '',
  ].join('\n')

  it('解析监听 :3000 的 PID(含 IPv6,去重)', () => {
    expect(parseListeningPids(sample, 3000)).toEqual([12345, 54321])
  })

  it('端口不匹配返回空数组', () => {
    expect(parseListeningPids(sample, 8080)).toEqual([])
  })

  it('非 LISTENING 行不纳入(ESTABLISHED 被忽略)', () => {
    expect(parseListeningPids(sample, 3000)).not.toContain(77777)
  })

  it('空输出返回空数组', () => {
    expect(parseListeningPids('', 3000)).toEqual([])
  })
})
