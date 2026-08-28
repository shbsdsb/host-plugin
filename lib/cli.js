// agent_plugin_dev/host-plugin/src/cli.ts
import { spawnSync, execFileSync } from 'node:child_process';
import { loadConfig } from "./config.js";
import { parseListeningPids, portInUse, taskkillPid } from "./win.js";
export const description = 'Host 服务器管理:go(终端阻塞启动)/close(关闭)';
export async function main(args, ctx) {
    const [sub, ...rest] = args;
    if (rest.length > 0) {
        ctx.io.stderr(`unknown flag: ${rest.join(' ')}`);
        return 1;
    }
    switch (sub) {
        case 'go': return go(ctx);
        case 'close': return close(ctx);
        default:
            ctx.io.stderr(`unknown flag: ${args.join(' ')}`);
            return 1;
    }
}
function requireStHome(ctx) {
    const stHome = ctx.env.ST_HOME;
    if (!stHome)
        throw new Error('ST_HOME 未设置(检查根目录 .env)');
    return stHome;
}
function requireBootstrapEntry(ctx) {
    const entry = ctx.env.ST_BOOTSTRAP;
    if (!entry) {
        throw new Error('ST_BOOTSTRAP 未设置(请通过最新版 st CLI 调度,或手动设置 ST_BOOTSTRAP 指向 bootstrap/src/index.ts)');
    }
    return entry;
}
async function go(ctx) {
    try {
        const stHome = requireStHome(ctx);
        const profile = ctx.env.ST_PROFILE ?? 'default';
        const cfg = loadConfig(stHome, profile);
        if (portInUse(cfg.port)) {
            ctx.io.stderr(`错误: 端口 ${cfg.port} 已被占用`);
            return 1;
        }
        const entry = requireBootstrapEntry(ctx);
        // 前台阻塞运行完整 cordis 插件树(终端阻塞):stdio 继承共享控制台,
        // Ctrl+C 传递给子进程;子进程退出码透传。
        // env 从 ctx.env 构建(.env 经 loadEnv 并入 ctx.env,不写回 process.env),
        // 保证 ST_HOME/ST_PROFILE/ST_BOOTSTRAP 等传递到 bootstrap 子进程
        const env = {};
        for (const [key, value] of Object.entries(ctx.env)) {
            if (value !== undefined)
                env[key] = value;
        }
        Object.assign(env, {
            ST_HOST_START: 'true',
            ST_HOST_HOST: cfg.host,
            ST_HOST_PORT: String(cfg.port),
            ST_HOST_LISTEN: String(cfg.listen),
            ST_HOST_LISTEN_WHITELIST: JSON.stringify(cfg.listenWhitelist),
            ST_HOST_OPEN: String(cfg.open),
        });
        const r = spawnSync('node', [entry], { stdio: 'inherit', env });
        if (r.error) {
            ctx.io.stderr(`错误: 启动 bootstrap 失败 ${r.error.message}`);
            return 1;
        }
        return r.status ?? 1;
    }
    catch (e) {
        ctx.io.stderr(`错误: ${e instanceof Error ? e.message : String(e)}`);
        return 1;
    }
}
async function close(ctx) {
    try {
        const stHome = requireStHome(ctx);
        const profile = ctx.env.ST_PROFILE ?? 'default';
        const cfg = loadConfig(stHome, profile);
        const out = execFileSync('netstat', ['-ano'], { encoding: 'utf8' });
        const pids = parseListeningPids(out, cfg.port);
        if (pids.length === 0) {
            ctx.io.stderr(`端口 ${cfg.port} 未在监听`);
            return 1;
        }
        for (const pid of pids)
            taskkillPid(pid);
        ctx.io.stdout(`已关闭端口 ${cfg.port} 的 ${pids.length} 个进程`);
        return 0;
    }
    catch (e) {
        ctx.io.stderr(`错误: ${e instanceof Error ? e.message : String(e)}`);
        return 1;
    }
}
