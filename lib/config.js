// agent_plugin_dev/host-plugin/src/config.ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as yaml from 'js-yaml';
export const DEFAULT_CONFIG = {
    host: '127.0.0.1',
    port: 3000,
    listen: false,
    listenWhitelist: [],
    open: true,
};
/** listen/listenWhitelist 语义 → 监听地址 */
export function resolveListenTarget(cfg) {
    if (!cfg.listen)
        return cfg.host;
    if (cfg.listenWhitelist.length > 0)
        return cfg.listenWhitelist[0];
    return '0.0.0.0';
}
export function normalizeConfig(raw) {
    const cfg = { ...DEFAULT_CONFIG };
    if (!raw)
        return cfg;
    if (typeof raw.host === 'string')
        cfg.host = raw.host;
    if (typeof raw.port === 'number' && Number.isInteger(raw.port) && raw.port >= 1 && raw.port <= 65535) {
        cfg.port = raw.port;
    }
    if (typeof raw.listen === 'boolean')
        cfg.listen = raw.listen;
    if (Array.isArray(raw.listenWhitelist) && raw.listenWhitelist.every((x) => typeof x === 'string')) {
        cfg.listenWhitelist = raw.listenWhitelist;
    }
    if (typeof raw.open === 'boolean')
        cfg.open = raw.open;
    return cfg;
}
function readHostEntryConfig(patchPath) {
    if (!existsSync(patchPath))
        return undefined;
    try {
        const entries = (yaml.load(readFileSync(patchPath, 'utf8'), { schema: yaml.JSON_SCHEMA }) ?? []);
        const entry = entries.find((e) => typeof e === 'object' && e !== null && e.id === 'host');
        const config = entry?.config;
        if (typeof config !== 'object' || config === null)
            return undefined;
        return config;
    }
    catch {
        return undefined;
    }
}
/** 读 patch 中 id=host 条目的 config:profile 级 → user 级(后者覆盖前者) */
export function loadConfig(stHome, profile = 'default') {
    const merged = {};
    for (const patchPath of [
        join(stHome, 'profile', profile, 'cordis.patch.yml'),
        join(stHome, 'cordis.patch.yml'),
    ]) {
        const config = readHostEntryConfig(patchPath);
        if (config)
            Object.assign(merged, config);
    }
    return normalizeConfig(merged);
}
