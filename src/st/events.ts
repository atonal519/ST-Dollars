import { getContext } from './context';

export function onChatChanged(callback: () => void): () => void {
  const ctx = getContext();
  const source = ctx?.eventSource;
  const event = ctx?.eventTypes?.CHAT_CHANGED;
  if (!source?.on || !event) return () => {};
  source.on(event, callback);
  return () => { (source.removeListener ?? source.off)?.call(source, event, callback); };
}
