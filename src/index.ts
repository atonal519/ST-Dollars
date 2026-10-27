import { version } from '../package.json';
import { createApp } from 'vue';
import { h, ref } from 'vue';
import App from '@/App.vue';
import '@/styles.css';
import '@/ui/blue-glass.css';
import '@/ui/record-pages.css';
import '@/ui/qqj-settings.css';
import {createGeneralSettings} from '@/host/general-settings';
import {createPluginUpdates} from '@/ui/native-settings.js';
import {jsonRequestHeaders} from '@/host/request-headers';
import { getHostContext } from '@/host/host-context';
import { createQQJPeopleReader } from '@/sources/qqj-people';
import { createQQJQuestionMaterialReader } from '@/sources/qqj-context';
import { createStoryInputReader } from '@/host/story-input';
import {createWorldSettingsReader} from '@/host/world-settings';
import { createStoryHistoryReader } from '@/host/story-history';
import { createWorldRepository } from '@/storage/world-repository';
import { createConfigService } from '@/models/config';
import { createModelRequester } from '@/models/client';
import { advanceBatch } from '@/simulation/advance';
import { createAppearanceSettings } from '@/host/appearance-settings';
import { createAppearanceController } from '@/ui/appearance';
import { createPluginSettings } from '@/host/plugin-settings';
import type { AppearanceThemeMode } from '@/host/appearance-settings';
import {createDevelopmentDiagnostics} from '@/diagnostics/development';
import brandLogo from '@/visuals/baimian-logo.svg?raw';

const HOST_ID = 'dollars-world-host';
const MENU_ITEM_ID = 'dollars-world-open';
const reader = createQQJPeopleReader();
const materialReader = createQQJQuestionMaterialReader();
const repository = createWorldRepository();
const config = createConfigService();
const enabledSettings = createPluginSettings();
const dependencies = {
  diagnostics:createDevelopmentDiagnostics({version}),
  directory: reader, repository, story: createStoryInputReader(), history: createStoryHistoryReader(), config,
  createModelRequester,
  materials: materialReader,
  worldSettings:createWorldSettingsReader(),
  advancer: { advance: advanceBatch },
};
const visible = ref(false);
const appearanceSettings = createAppearanceSettings();
let general:ReturnType<typeof createGeneralSettings>,updates:any,renderMarkdown:(value:string)=>string;

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
  const container = document.createElement('div');
  container.style.display = 'none';
  stylesheet.addEventListener('load', () => container.style.removeProperty('display'), { once: true });
  shadow.replaceChildren(icons, stylesheet, container);
  createApp({
    setup: () => () => h(App, { dependencies, materialReader, config, enabledSettings, appearance, general, updates, renderMarkdown, visible: visible.value, onClose: () => { visible.value = false; } }),
  }).mount(container);
}

function installMenuItem() {
  const tryInstall = () => {
    const menu = document.querySelector('#sp_wand_container') || document.querySelector('#extensionsMenu');
    if (!menu) return false;
    if (document.getElementById(MENU_ITEM_ID)) return true;
    const item = document.createElement('div');
    item.id = MENU_ITEM_ID;
    item.className = 'list-group-item flex-container flexGap5';
    Object.assign(item.style, { display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', whiteSpace: 'nowrap' });
    item.setAttribute('role', 'button');
    item.tabIndex = 0;
    const icon = document.createElement('span');
    icon.className = 'extensionsMenuExtensionButton';
    Object.assign(icon.style, { width: '20px', height: '20px', flex: '0 0 20px' });
    icon.innerHTML = brandLogo;
    Object.assign((icon.firstElementChild as SVGSVGElement).style, { width: '18px', height: '18px', display: 'block' });
    (icon.firstElementChild as SVGSVGElement).setAttribute('stroke-width', '0.777778');
    const label = document.createElement('span');
    label.textContent = '百面相';
    item.append(icon, label);
    item.addEventListener('click', togglePanel);
    item.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); togglePanel(); } });
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

async function initialize(tries = 0) {
  if (getHostContext()) {
    general=createGeneralSettings();
    const origin=globalThis.location.href;
    const [extensions,library]=await Promise.all([import(/* @vite-ignore */new URL('/scripts/extensions.js',origin).href),import(/* @vite-ignore */new URL('/lib.js',origin).href)]);
    updates=createPluginUpdates({moduleUrl:import.meta.url,extensionTypes:()=>extensions.extensionTypes,noticePath:'docs/updates-alpha59.md',headers:()=>jsonRequestHeaders(getHostContext()?.getRequestHeaders?.()??{})});
    renderMarkdown=value=>library.DOMPurify.sanitize(new library.showdown.Converter().makeHtml(value),{FORBID_TAGS:['img','iframe','object','embed','style','form'],FORBID_ATTR:['style']});
    mountPanel();
    installMenuItem();
    console.info(`[Dollars] 百面相 ${version} 已加载`);
    return;
  }
  if (tries < 150) setTimeout(() => initialize(tries + 1), 200);
}

initialize();
