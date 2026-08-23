import { createApp } from 'vue';
import App from '@/App.vue';
import '@/styles.css';
import { store } from '@/state';
import { fetchHealth, healthText } from '@/transport';

const HOST_ID = 'dollars-app-host';

function mount() {
  let host = document.getElementById(HOST_ID);
  if (!host) { host = document.createElement('div'); host.id = HOST_ID; document.body.appendChild(host); }
  host.style.setProperty('display', 'none', 'important');  // 默认隐藏，点魔杖才打开
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  shadow.textContent = '';
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./index.css', import.meta.url).href;  // dist/index.css 同级
  shadow.appendChild(link);
  const container = document.createElement('div');
  shadow.appendChild(container);
  createApp(App).mount(container);
}

function injectWand(onClick: () => void) {
  const tryInject = () => {
    const menu = document.getElementById('extensionsMenu');
    if (!menu) return false;
    if (document.getElementById('dollars_wand')) return true;
    const item = document.createElement('div');
    item.id = 'dollars_wand';
    item.className = 'list-group-item flex-container flexGap5 interactable';
    item.innerHTML = '<div class="fa-solid fa-comments extensionsMenuExtensionButton"></div><span>Dollars</span>';
    item.addEventListener('click', onClick);
    menu.appendChild(item);
    return true;
  };
  if (tryInject()) return;
  const obs = new MutationObserver(() => { if (tryInject()) obs.disconnect(); });
  obs.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => obs.disconnect(), 30000);
}

function toggle() {
  const el = document.getElementById(HOST_ID);
  if (el) el.style.setProperty('display', el.style.getPropertyValue('display') === 'none' ? 'contents' : 'none', 'important');
}

(function whenReady(tries = 0) {
  if ((globalThis as any).SillyTavern?.getContext) {
    mount();
    injectWand(toggle);
    console.log('[Dollars] M0 前端已加载');
    fetchHealth().then(h => { store.status = healthText(h); });
  } else if (tries < 150) { setTimeout(() => whenReady(tries + 1), 200); }
})();
