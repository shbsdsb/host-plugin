// agent_plugin_dev/host-plugin/src/web-server.ts
import { createServer } from 'node:http';
export class WebServerService {
    entries = [];
    fallbackHandler = null;
    _server = createServer((req, res) => void this.dispatch(req, res));
    get server() {
        return this._server;
    }
    get listening() {
        return this._server.listening;
    }
    register(opts) {
        if (typeof opts !== 'object' || opts === null)
            throw err(400, 'register 参数必须是对象');
        if (opts.kind !== 'exact' && opts.kind !== 'prefix')
            throw err(400, "kind 必须是字面量 'exact' 或 'prefix'");
        if (typeof opts.path !== 'string' || opts.path.length === 0)
            throw err(400, 'path 必须是非空字符串');
        if (typeof opts.handler !== 'function')
            throw err(400, 'handler 必须是函数');
        if (this.entries.some((e) => e.path === opts.path)) {
            throw err(409, `路由路径已注册: ${opts.path}`);
        }
        const entry = { kind: opts.kind, path: opts.path, handler: opts.handler };
        this.entries.push(entry);
        let disposed = false;
        return () => {
            if (disposed)
                return;
            disposed = true;
            this.entries = this.entries.filter((e) => e !== entry);
        };
    }
    registerFallback(opts) {
        if (typeof opts !== 'object' || opts === null)
            throw err(400, 'registerFallback 参数必须是对象');
        if (typeof opts.handler !== 'function')
            throw err(400, 'handler 必须是函数');
        if (this.fallbackHandler)
            throw err(409, 'fallback 已注册,全局唯一');
        this.fallbackHandler = opts.handler;
        let disposed = false;
        return () => {
            if (disposed)
                return;
            disposed = true;
            this.fallbackHandler = null;
        };
    }
    async dispatch(req, res) {
        let pathname;
        try {
            pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
        }
        catch {
            res.writeHead(400, { 'content-type': 'text/plain' });
            res.end('400 Bad Request');
            return;
        }
        const exact = this.entries.find((e) => e.kind === 'exact' && e.path === pathname);
        if (exact) {
            await this.runHandler(exact.handler, pathname, req, res);
            return;
        }
        let best = null;
        for (const e of this.entries) {
            if (e.kind !== 'prefix')
                continue;
            if (pathname === e.path || pathname.startsWith(e.path + '/')) {
                if (!best || e.path.length > best.path.length)
                    best = e;
            }
        }
        if (best) {
            await this.runHandler(best.handler, pathname, req, res);
            return;
        }
        if (this.fallbackHandler) {
            await this.runHandler(this.fallbackHandler, pathname, req, res);
            return;
        }
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('404 Not Found');
    }
    async runHandler(handler, pathname, req, res) {
        try {
            await handler(req, res);
        }
        catch (error) {
            console.error(`[webServer] route ${pathname} error:`, error);
            if (res.headersSent) {
                res.destroy();
            }
            else {
                res.writeHead(500, { 'content-type': 'text/plain' });
                res.end('500 Internal Server Error');
            }
        }
    }
    start(port, host) {
        return new Promise((resolve, reject) => {
            const onError = (err) => {
                this._server.off('listening', onListening);
                reject(err);
            };
            const onListening = () => {
                this._server.off('error', onError);
                resolve();
            };
            this._server.once('error', onError);
            this._server.once('listening', onListening);
            this._server.listen(port, host);
        });
    }
    stop() {
        return new Promise((resolve, reject) => {
            if (!this._server.listening) {
                resolve();
                return;
            }
            this._server.close((err) => (err ? reject(err) : resolve()));
        });
    }
}
function err(code, message) {
    return Object.assign(new Error(message), { code });
}
