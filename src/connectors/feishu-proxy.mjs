/** WebSocket proxy selection extracted from pinned dsh-im production.mjs; MIT. */
import HttpsProxyAgent from 'https-proxy-agent';

// The WebSocket agent built here is only used for the Feishu long connection,
// whose endpoint is open.feishu.cn (Feishu) or open.larksuite.com (Lark).
// Honor NO_PROXY/no_proxy for those hosts so users with blanket proxy
// environments exported in their shell (Clash/V2Ray etc.) keep a direct
// connection to Feishu instead of routing the WSS handshake through the proxy.
const LONG_CONNECTION_HOSTS = ['open.feishu.cn', 'open.larksuite.com'];

function hostExcludedByNoProxyEntry(host, entry) {
  if (entry === '*') return true;
  const bare = entry.startsWith('.') ? entry.slice(1) : entry;
  if (!bare) return false;
  return host === bare || host.endsWith(`.${bare}`);
}

function longConnectionExcludedByNoProxy(env) {
  for (const key of ['no_proxy', 'NO_PROXY']) {
    const value = env?.[key];
    if (typeof value !== 'string' || !value.trim()) continue;
    const entries = value.split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean);
    if (LONG_CONNECTION_HOSTS.some((host) => entries.some((entry) => hostExcludedByNoProxyEntry(host, entry)))) {
      return true;
    }
  }
  return false;
}

function webSocketProxyUrl(env) {
  if (longConnectionExcludedByNoProxy(env)) return undefined;
  for (const key of ['https_proxy', 'HTTPS_PROXY', 'http_proxy', 'HTTP_PROXY']) {
    const value = env?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

export function createFeishuWebSocketAgent(
  env,
  createAgent = (url) => new HttpsProxyAgent(url),
) {
  const proxyUrl = webSocketProxyUrl(env);
  return proxyUrl ? createAgent(proxyUrl) : undefined;
}
