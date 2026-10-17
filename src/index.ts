import { createApp } from 'vue';
import App from '@/App.vue';
import '@/styles.css';
import { getHostContext } from '@/host/host-context';

const HOST_ID = 'dollars-world-host';
const MENU_ITEM_ID = 'dollars-world-open';

function togglePanel() {
  const host = document.getElementById(HOST_ID);
  if (!host) return;
  host.style.setProperty('display', host.style.display === 'none' ? 'contents' : 'none', 'important');
}

function mountPanel() {
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    document.body.appendChild(host);
  }
  host.style.setProperty('display', 'none', 'important');

  const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  const cssUrl = new URL(/* @vite-ignore */ './index.css', import.meta.url);
  cssUrl.search = new URL(import.meta.url).search;
  stylesheet.href = cssUrl.href;
  shadow.replaceChildren(stylesheet);

  const container = document.createElement('div');
  shadow.appendChild(container);
  createApp(App, { onClose: togglePanel }).mount(container);
}

function installMenuItem() {
  const tryInstall = () => {
    const menu = document.getElementById('extensionsMenu');
    if (!menu) return false;
    if (document.getElementById(MENU_ITEM_ID)) return true;
    const item = document.createElement('div');
    item.id = MENU_ITEM_ID;
    item.className = 'list-group-item flex-container flexGap5 interactable';
    const icon = document.createElement('div');
    icon.className = 'fa-solid fa-diagram-project extensionsMenuExtensionButton';
    const label = document.createElement('span');
    label.textContent = '人物世界';
    item.append(icon, label);
    item.addEventListener('click', togglePanel);
    menu.appendChild(item);
    return true;
  };

  if (tryInstall()) return;
  const observer = new MutationObserver(() => {
    if (tryInstall()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 30_000);
}

function initialize(tries = 0) {
  if (getHostContext()) {
    mountPanel();
    installMenuItem();
    console.info('[Dollars] 人物世界骨架已加载');
    return;
  }
  if (tries < 150) setTimeout(() => initialize(tries + 1), 200);
}

initialize();
