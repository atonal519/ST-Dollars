import { createSettingsKit } from './kit.js';
import { BASE_PROCESSING_PROMPT } from '../../../host/shared-processing-prompt.js';
// 长提示词在草稿弹窗内编辑，保存时一次写入；短设置仍即时生效。
export function createPromptsSettings({ settings, documentRef = globalThis.document, open = false, onToggle, onStoryClockChange, customImpl = null, subscribeSettingsChange = null } = {}) {
  const { element, button, field, subDrawer } = createSettingsKit(documentRef);
  const { drawer, body } = subDrawer({ title: '提示词与包裹符', id: 'bmx-settings-prompts', open, onToggle });
  body.className += ' settings-drawer-list';
  const { drawer: wrapperDrawer, body: wrapperBody } = subDrawer({ title: '包裹符', id: 'bmx-settings-wrappers' });
  const wrappers = settings.wrappers();
  const keepTags = element('input', 'settings-input'); keepTags.value = wrappers.keepTags; keepTags.placeholder = 'content';
  const extraTags = element('input', 'settings-input'); extraTags.value = wrappers.extraTags; extraTags.placeholder = '如：think, reasoning, [[...]]';
  const { drawer: processingDrawer, body: processingBody } = subDrawer({ title: '破限提示词', id: 'bmx-settings-processing-prompt' });
  keepTags.addEventListener('change', () => settings.updateWrappers({ keepTags: keepTags.value }));
  extraTags.addEventListener('change', () => settings.updateWrappers({ extraTags: extraTags.value }));
  const refreshWrappers = () => {
    const value = settings.wrappers();
    for (const [input, key] of [[keepTags, 'keepTags'], [extraTags, 'extraTags']]) {
      if (documentRef.activeElement !== input && !input.matches?.(':focus')) input.value = value[key];
    }
  };
  keepTags.addEventListener('blur', refreshWrappers); extraTags.addEventListener('blur', refreshWrappers);
  const releaseSettings = subscribeSettingsChange?.(refreshWrappers);
  const promptDialog = (title, value, defaultText, onSave) => {
    if (typeof customImpl !== 'function') return;
    const panel = element('section', 'qqj-editor-dialog');
    panel.append(element('p', 'qqj-editor-intro', '修改内容仅在保存后生效，取消不会更改当前提示词。'));
    const group = element('section', 'qqj-editor-group'); group.append(element('h3', '', title));
    const input = element('textarea', 'settings-input qqj-editor-textarea'); input.value = value; input.placeholder = '留空使用内置默认'; input.rows = 12;
    const actions = element('div', 'qqj-editor-inline-actions');
    actions.append(button('载入内置默认', 'secondary-action', () => { input.value = defaultText; }), button('恢复默认', 'secondary-action', () => { input.value = ''; }));
    group.append(input, actions); panel.append(group);
    void customImpl({ title: `编辑${title}`, content: panel, confirmText: '保存', cancelText: '取消', submit: async () => { await onSave(input.value); return true; } });
  };
  const promptButton = (bodyNode, title, key, defaultText, onSave) => {
    bodyNode.append(button(`编辑${title}`, 'secondary-action', () => promptDialog(title, key === 'processingPrompt' ? settings.processingPrompt() : settings.get()[key] ?? '', defaultText, onSave)));
  };
  const promptEditor = ({ body: editorBody, key, defaultText, label, hint = '这里只改内容要求；输出结构、人物绑定和信息范围由程序维护。恢复默认会使用内置文本。' }) => {
    editorBody.append(element('p', 'settings-hint', hint));
    promptButton(editorBody, label, key, defaultText, async text => settings.update({ [key]: text }));
  };
  promptEditor({ body: processingBody, key: 'processingPrompt', defaultText: BASE_PROCESSING_PROMPT, label: '破限提示词', hint: '白鳥系列文字模型请求共用，保存后供下一次请求使用；留空使用内置默认；恢复默认清空草稿，保存后生效。' });
  wrapperBody.append(element('p', 'settings-hint', '白鳥系列插件全部共享'), field('保留包裹符', keepTags), field('清洗包裹符', extraTags));
  body.append(wrapperDrawer, processingDrawer);
  return { node: drawer, dispose: () => releaseSettings?.() };
}
