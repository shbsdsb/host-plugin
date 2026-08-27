// agent_plugin_dev/host-plugin/src/types.ts
export interface CliEnv {
  ST_HOME?: string
  ST_PROFILE?: string
  [key: string]: string | undefined
}

export interface CliIO {
  stdout(s: string): void
  stderr(s: string): void
}

export interface CliContext {
  env: CliEnv
  io: CliIO
}
