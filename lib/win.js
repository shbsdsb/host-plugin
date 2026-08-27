// agent_plugin_dev/host-plugin/src/win.ts
import { execFileSync, spawnSync } from 'node:child_process';
/** 从 netstat -ano 输出解析监听 :port 的 PID(纯函数,去重) */
export function parseListeningPids(output, port) {
    const pids = [];
    const re = /^\s*TCP\s+(\[[^\]]+\]|\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i;
    for (const line of output.split(/\r?\n/)) {
        const m = line.match(re);
        if (m && Number(m[2]) === port)
            pids.push(Number(m[3]));
    }
    return [...new Set(pids)];
}
/** 端口是否被监听(netstat -ano) */
export function portInUse(port) {
    const out = execFileSync('netstat', ['-ano'], { encoding: 'utf8' });
    return parseListeningPids(out, port).length > 0;
}
/** 强杀指定 PID;失败抛 Error */
export function taskkillPid(pid) {
    const r = spawnSync('taskkill', ['/F', '/PID', String(pid)], { stdio: 'pipe', encoding: 'utf8' });
    if (r.status !== 0) {
        throw new Error(`taskkill /PID ${pid} 失败: ${(r.stderr ?? '').trim()}`);
    }
}
