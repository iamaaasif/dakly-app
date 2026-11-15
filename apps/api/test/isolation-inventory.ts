type Route = { method: string | string[]; url: string; handler: unknown; onSend?: unknown };
export class IsolationInventory {
  private readonly routes = new Map<string, Route>();
  record(route: Route) {
    for (const method of Array.isArray(route.method) ? route.method : [route.method])
      this.routes.set(`${method} ${route.url}`, route);
  }

  applicationRoutes() {
    return [...this.routes]
      .filter(([key, route]) => !this.generatedHead(key, route))
      .map(([key]) => key)
      .sort();
  }

  assertCovered(expected: Iterable<string>) {
    const routes = this.applicationRoutes(),
      declared = [...expected].sort();
    const missing = routes.filter((route) => !declared.includes(route));
    const stale = declared.filter((route) => !routes.includes(route));
    if (missing.length || stale.length)
      throw new Error(
        `Missing isolation fixtures: ${missing.join(', ')}; stale fixtures: ${stale.join(', ')}`,
      );
  }

  private generatedHead(key: string, route: Route) {
    if (!key.startsWith('HEAD ')) return false;
    const get = this.routes.get(`GET ${route.url}`);
    const onSend = Array.isArray(route.onSend) ? route.onSend : [route.onSend];
    // Fastify derives HEAD using the identical GET handler plus its payload-stripping hook.
    // An explicit HEAD handler must get its own fixture even when a GET path exists.
    return (
      get?.handler === route.handler &&
      onSend.some(
        (hook: unknown) => typeof hook === 'function' && hook.name === 'headRouteOnSendHandler',
      )
    );
  }
}
