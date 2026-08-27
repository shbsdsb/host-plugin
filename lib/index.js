import { loadConfig, DEFAULT_CONFIG } from "./config.js";
export const name = 'host';
export function apply(ctx) {
    const stHome = process.env.ST_HOME ?? '';
    const profile = process.env.ST_PROFILE ?? 'default';
    const config = stHome ? loadConfig(stHome, profile) : { ...DEFAULT_CONFIG };
    ctx.host = { config };
    ctx.effect(() => () => { }); // 占位清理(骨架)
}
