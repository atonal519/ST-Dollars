// M0 规则：协议版本严格相等才兼容（后续可放宽为 major 相容）
export function isCompatible(clientVer, serverVer) {
  return Number.isInteger(serverVer) && clientVer === serverVer;
}
