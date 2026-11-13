/**
 * 轻量事件总线：网关对外的官方扩展点。
 *
 * 设计约束（面向「作者不再维护、他人自由扩展」的场景）：
 * - 零依赖、单一文件、Node 18+ 原生语法；
 * - emit 对每个监听器 try/catch，一个坏插件不会拖垮网关；
 * - 监听器抛错只记录，不中断广播，也不计入 fatal 窗口；
 * - 支持同名多监听、once、off，语义与 Node EventEmitter 对齐但不继承它，
 *   避免内部实现被外部依赖。
 *
 * 内置事件（payload 均为纯数据快照，禁止传内部对象引用后修改）：
 *   message-added     { message, source }   每条消息落盘后（web 发送 / onebot 回复 / 导入）
 *   client-open       { count, remoteIp }   浏览器 WS 建立
 *   client-close      { count, remoteIp }   浏览器 WS 断开
 *   profiles-updated  { ids }               实例配置整体替换后
 *   upstream-status    { profile, connected, detail }
 */
const listeners = new Map();

export function on(event, handler) {
  if (typeof event !== "string" || typeof handler !== "function") return () => {};
  const set = listeners.get(event) || new Set();
  set.add(handler);
  listeners.set(event, set);
  return () => off(event, handler);
}

export function once(event, handler) {
  if (typeof handler !== "function") return () => {};
  const dispose = on(event, (payload) => {
    dispose();
    handler(payload);
  });
  return dispose;
}

export function off(event, handler) {
  listeners.get(event)?.delete(handler);
}

export function emit(event, payload) {
  const set = listeners.get(event);
  if (!set?.size) return;
  for (const handler of [...set]) {
    try {
      handler(payload);
    } catch (error) {
      // 扩展的错不该影响网关主流程；只打日志。
      console.error(`[events:${event}]`, error);
    }
  }
}

export function listenerCount(event) {
  return listeners.get(event)?.size || 0;
}
