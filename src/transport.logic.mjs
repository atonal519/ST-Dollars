// M0 规则：协议版本严格相等才兼容（后续可放宽为 major 相容）
export function isCompatible(clientVer, serverVer) {
  return Number.isInteger(serverVer) && clientVer === serverVer;
}

// 把 /health 结果翻译成面板上给人看的一句话
export function describeHealth(clientVer, health) {
  if (!health || health.ok !== true) return '连不上后端（server plugin 没装 / 没开 enableServerPlugins / 没重启）';
  if (!isCompatible(clientVer, health.protocolVersion)) return `版本不兼容：前端 v${clientVer} / 后端 v${health.protocolVersion}`;
  return `已连通 · 版本 OK (v${clientVer}) · DB ${health.db === 'ok' ? 'OK' : health.db}`;
}
