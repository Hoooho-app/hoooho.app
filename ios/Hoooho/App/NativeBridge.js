(function () {
  if (location.origin !== 'https://hoooho.com') return;
  const pending = new Map();
  window.__hooohoNativeReply = function (id, result) {
    const waiter = pending.get(id); if (!waiter) return;
    pending.delete(id); clearTimeout(waiter.timer);
    if (result.ok) waiter.resolve();
    else waiter.reject(new DOMException(result.error || '分享未完成', 'AbortError'));
  };
  const send = (type, payload) => new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('系统操作未完成，请重试')); }, 120000);
    pending.set(id, {resolve, reject, timer});
    window.webkit.messageHandlers.hooohoNative.postMessage({id, type, ...payload});
  });
  if (typeof navigator.share !== 'function') {
    navigator.share = async data => {
      if (data.files && data.files.length) throw new DOMException('请使用导出文件按钮后在系统中分享', 'NotSupportedError');
      return send('share', {title: String(data.title || ''), text: String(data.text || ''), url: String(data.url || '')});
    };
  }
  window.print = () => { void send('print', {}).catch(() => {}); };
})();
