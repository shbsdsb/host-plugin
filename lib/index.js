// agent_plugin_dev/host-plugin/src/index.ts
import { execFileSync } from 'node:child_process';
import { loadConfig, DEFAULT_CONFIG, resolveListenTarget } from "./config.js";
import { WebServerService } from "./web-server.js";
export const name = 'host';
export function apply(ctx) {
    const stHome = process.env.ST_HOME ?? '';
    const profile = process.env.ST_PROFILE ?? 'default';
    const config = stHome ? loadConfig(stHome, profile) : { ...DEFAULT_CONFIG };
    ctx.provide('host', { config });
    const webserver = new WebServerService();
    ctx.provide('webServer', webserver);
    ctx.effect(() => async () => {
        await webserver.stop();
    });
    // st host go 前台运行时由 CLI 注入 ST_HOST_START=true:启动 HTTP 服务并保持进程
    if (process.env.ST_HOST_START === 'true') {
        return (async () => {
            const target = resolveListenTarget(config);
            try {
                await webserver.start(config.port, target);
            }
            catch (error) {
                console.error(`Host 启动失败: ${error instanceof Error ? error.message : String(error)}`);
                process.exit(1);
            }
            ctx.logger.info(`Host listening on http://${target}:${config.port}`);
            if (config.open) {
                try {
                    execFileSync('cmd', ['/c', 'start', '', `http://${target}:${config.port}`], { stdio: 'ignore' });
                }
                catch {
                    // 浏览器打开失败不阻塞服务
                }
            }
        })();
    }
}
