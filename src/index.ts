import { createApp } from 'vue';
import { h, ref } from 'vue';
import App from '@/App.vue';
import '@/styles.css';
import { getHostContext } from '@/host/host-context';
import { createQQJPeopleReader } from '@/sources/qqj-people';
import { createQQJQuestionMaterialReader } from '@/sources/qqj-context';
import { createStoryInputReader } from '@/host/story-input';
import { createWorldRepository } from '@/storage/world-repository';
import { createConfigService } from '@/models/config';
import { createModelRequester } from '@/models/client';
import { advanceBatch } from '@/simulation/advance';
import { createAppearanceSettings } from '@/host/appearance-settings';
import { createAppearanceController } from '@/ui/appearance';
import type { AppearanceThemeMode } from '@/host/appearance-settings';

const HOST_ID = 'dollars-world-host';
const MENU_ITEM_ID = 'dollars-world-open';
const reader = createQQJPeopleReader();
const materialReader = createQQJQuestionMaterialReader();
const repository = createWorldRepository();
const config = createConfigService();
const dependencies = {
  directory: reader, repository, story: createStoryInputReader(), config,
  createModelRequester,
  materials: materialReader,
  advancer: { advance: advanceBatch },
};
const visible = ref(false);
const appearanceSettings = createAppearanceSettings();

function togglePanel() {
  visible.value = !visible.value;
}

function mountPanel() {
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    document.body.appendChild(host);
  }
  host.style.setProperty('display', 'block', 'important');
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.zIndex = '10060';
  host.style.pointerEvents = 'none';
  const appearanceController = createAppearanceController({ host, settings: appearanceSettings });
  const appearance = {
    getTheme: () => appearanceSettings.get().appearanceTheme,
    saveTheme: (mode: AppearanceThemeMode) => { appearanceSettings.save(mode); appearanceController.apply(); },
    destroy: () => appearanceController.destroy(),
  };

  const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  const icons = document.createElement('link');
  icons.rel = 'stylesheet';
  icons.href = '/css/fontawesome.min.css';
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  const cssUrl = new URL(/* @vite-ignore */ './index.css', import.meta.url);
  cssUrl.search = new URL(import.meta.url).search;
  stylesheet.href = cssUrl.href;
  shadow.replaceChildren(icons, stylesheet);

  const container = document.createElement('div');
  shadow.appendChild(container);
  createApp({
    setup: () => () => h(App, { dependencies, materialReader, config, appearance, visible: visible.value, onClose: () => { visible.value = false; } }),
  }).mount(container);
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
    label.textContent = '百面相';
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
    console.info('[Dollars] 百面相已加载');
    return;
  }
  if (tries < 150) setTimeout(() => initialize(tries + 1), 200);
}

initialize();
