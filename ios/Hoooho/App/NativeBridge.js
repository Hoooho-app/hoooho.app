(function () {
  // srcdoc reports inherit the app origin even though location.origin is "null".
  if (!['https://hoooho.com', 'https://hooohoapp-production.up.railway.app'].includes(window.origin)) return;
  const pending = new Map();
  window.__hooohoNativeReply = function (id, result) {
    const waiter = pending.get(id); if (!waiter) return;
    pending.delete(id); clearTimeout(waiter.timer);
    if (result.ok) waiter.resolve(result);
    else waiter.reject(new DOMException(result.error || '操作未完成', result.cancelled || ['share', 'print'].includes(waiter.type) ? 'AbortError' : 'OperationError'));
  };
  const send = (type, payload, timeout = 120000) => new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('系统操作未完成，请重试')); }, timeout);
    pending.set(id, {resolve, reject, timer, type});
    window.webkit.messageHandlers.hooohoNative.postMessage({id, type, ...payload});
  });
  if (typeof navigator.share !== 'function') {
    navigator.share = async data => {
      if (data.files && data.files.length) throw new DOMException('请使用导出文件按钮后在系统中分享', 'NotSupportedError');
      await send('share', {title: String(data.title || ''), text: String(data.text || ''), url: String(data.url || '')});
    };
  }
  window.print = () => {
    void send('print', {html: document.documentElement.outerHTML}).catch(() => {});
  };
  if (window.top === window) {
  window.hooohoNativeAppearance = color => {
    if (typeof color !== 'string' || color.length !== 7 || !/^#[0-9a-f]{6}$/i.test(color)) return;
    window.webkit.messageHandlers.hooohoNative.postMessage({id: crypto.randomUUID(), type: 'appearance', color});
  };
  window.hooohoNativeAttachments = async (options = {}) => {
    const selection = await send('attachments', options.mediaOnly === true ? {mediaOnly: true} : {}, 600000);
    try {
      const files = [];
      for (const item of selection.files) {
        const chunks = [];
        let offset = 0;
        while (offset < item.size) {
          const part = await send('attachment_read', {selectionId: selection.selectionId, fileId: item.id, offset});
          const bytes = Uint8Array.from(atob(part.data), char => char.charCodeAt(0));
          if (!bytes.length || offset + bytes.length > item.size) throw new Error('资料读取未完成，请重新选择');
          chunks.push(bytes); offset += bytes.length;
        }
        files.push(new File(chunks, item.name, {type: item.mimeType, lastModified: Date.now()}));
      }
      return {files, origin: selection.origin};
    } finally {
      await send('attachment_release', {selectionId: selection.selectionId}).catch(() => {});
    }
  };
  window.hooohoNativeAttachments.supportsMediaOnly = true;
  }
})();

