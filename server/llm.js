function extractContent(data) {
  if (data?.error) throw new Error('API 返回错误: ' + (data.error.message || JSON.stringify(data.error)));
  const c = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? '';
  if (typeof c !== 'string' || !c.trim()) throw new Error('模型返回空内容');
  return c.trim();
}

// 后端直接 fetch 用户端点（Node 无 CORS）；url 末尾自动补 /chat/completions；带超时
async function callSecondary(cfg, messages, { maxTokens = 1024, temperature, signal, timeoutMs = 60000 } = {}) {
  if (!cfg?.url || !cfg?.key) throw new Error('Secondary API 未配置');
  const base = String(cfg.url).replace(/\/+$/, '');
  const endpoint = /\/chat\/completions$/.test(base) ? base : base + '/chat/completions';
  const body = { model: cfg.model, messages, stream: false };
  if (Number.isFinite(maxTokens)) body.max_tokens = maxTokens;
  if (Number.isFinite(temperature)) body.temperature = temperature;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  if (signal) signal.addEventListener('abort', () => ctrl.abort(), { once: true });
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key },
      body: JSON.stringify(body), signal: ctrl.signal,
    });
    if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + (await res.text().catch(() => '')).slice(0, 200));
    return extractContent(await res.json());
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error(`请求超时（${Math.round(timeoutMs / 1000)}s）或被中止——检查端点是否可达`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
module.exports = { extractContent, callSecondary };
