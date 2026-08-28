// agent_plugin_dev/host-plugin/src/webserver.ts
import { createServer } from 'node:http';
/** 极简 HTTP 路由服务:原生 node:http,精确路径匹配,404/500 兜底 */
export class WebserverService {
    routes = [];
    _server = createServer((req, res) => void this.dispatch(req, res));
    /** 原生 http.Server(供高级访问/测试获取端口) */
    get server() {
        return this._server;
    }
    get listening() {
        return this._server.listening;
    }
    route(method, path, handler) {
        this.routes.push({ method: method.toUpperCase(), path, handler });
    }
    get(path, handler) {
        this.route('GET', path, handler);
    }
    post(path, handler) {
        this.route('POST', path, handler);
    }
    all(path, handler) {
        this.route('ALL', path, handler);
    }
    async dispatch(req, res) {
        const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
        const method = req.method?.toUpperCase() ?? 'GET';
        const route = this.routes.find((r) => (r.method === 'ALL' || r.method === method) && r.path === pathname);
        if (!route) {
            res.writeHead(404, { 'content-type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }
        try {
            await route.handler(req, res);
        }
        catch (error) {
            console.error(`[webserver] route ${method} ${pathname} error:`, error);
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
