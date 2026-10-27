import {applyPluginEnabledImmediately} from './plugin-enabled.js';
import {createPluginUpdatesView} from './plugin-updates-view.js';
import {publicErrorMessage} from './public-error.js';
// Original QQJ renderSettings master row; callbacks retain the owning plugin's enable/stop behavior.
export function createMasterSwitch({settings,onPluginEnabledChange,pluginUpdates,dialog,renderUpdateMarkdown,documentRef=document}) {
  const element=(tag,className='',text='')=>{const node=documentRef.createElement(tag);node.className=className;node.textContent=text;return node;};
  const master = element('div', 'master-switch');
  const toggle = element('label', 'setting-switch');
  const enabledInput = element('input');enabledInput.type='checkbox';enabledInput.checked=settings.isEnabled();
  toggle.append(enabledInput,element('span','','启用百面相'));
  const enabledResult=element('p','settings-result');
  enabledInput.addEventListener('change',async()=>{
    const previous=settings.isEnabled(),desired=enabledInput.checked;enabledInput.disabled=true;
    enabledResult.textContent=desired?'正在开启并保存…':'正在关闭并保存…';enabledResult.className='settings-result';
    try{const applied=await applyPluginEnabledImmediately({settings,enabled:desired,onChange:onPluginEnabledChange});if(applied.stale)return;
      enabledResult.textContent=desired?'百面相已开启；酒馆正在后台保存设置。':'百面相已关闭，已有记录保留；酒馆正在后台保存设置。';enabledResult.className='settings-result success';
    }catch(error){enabledInput.checked=previous;enabledResult.textContent=`${desired?'启用':'关闭'}失败，已恢复原状态：${publicErrorMessage(error,{fallback:'请重新操作开关。'})}`;enabledResult.className='settings-result error';}
    finally{enabledInput.disabled=false;}
  });
  const masterRow=element('div','master-switch-row');masterRow.append(toggle);
  const updatesView=createPluginUpdatesView({updates:pluginUpdates,dialog,documentRef,renderMarkdown:renderUpdateMarkdown});masterRow.append(updatesView.controls);
  master.append(masterRow,enabledResult,updatesView.feedback);
  return {node:master,noticeRow:updatesView.noticeRow,dispose:updatesView.dispose};
}
