/* ============================================================
 * IronWeb 数据接口层
 * ------------------------------------------------------------
 * 自动识别两种模式：
 *   server 模式 —— 后端在运行（本地 node server.js 或云端部署），
 *                  数据实时保存到服务器磁盘（本地即 E:\AiWork\Web\IronWeb\data）
 *   local  模式 —— 纯静态托管（如 GitHub Pages），后端不可达，
 *                  数据自动降级保存到浏览器 IndexedDB，仍然完整可用
 * ============================================================ */
'use strict';

const IronAPI = (() => {
  let mode = null; // 'server' | 'local'
  let dbPromise = null;

  // ---------- IndexedDB ----------
  function idb() {
    if (!dbPromise) {
      dbPromise = new Promise((res, rej) => {
        const r = indexedDB.open('ironweb', 1);
        r.onupgradeneeded = () => {
          const d = r.result;
          if (!d.objectStoreNames.contains('novels')) d.createObjectStore('novels', { keyPath: 'id' });
          if (!d.objectStoreNames.contains('videos')) d.createObjectStore('videos', { keyPath: 'id' });
          if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs', { keyPath: 'id' });
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }
    return dbPromise;
  }
  function idbReq(req) { return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); }); }
  async function idbAll(store) {
    const db = await idb();
    return idbReq(db.transaction(store, 'readonly').objectStore(store).getAll());
  }
  async function idbGet(store, key) {
    const db = await idb();
    return idbReq(db.transaction(store, 'readonly').objectStore(store).get(key));
  }
  async function idbPut(store, value) {
    const db = await idb();
    return idbReq(db.transaction(store, 'readwrite').objectStore(store).put(value));
  }
  async function idbDel(store, key) {
    const db = await idb();
    return idbReq(db.transaction(store, 'readwrite').objectStore(store).delete(key));
  }

  // ---------- 模式探测 ----------
  async function detect() {
    try {
      const r = await fetch('api/health', { cache: 'no-store' });
      mode = r.ok ? 'server' : 'local';
    } catch { mode = 'local'; }
    return mode;
  }
  function getMode() { return mode; }

  // ---------- 通用 fetch ----------
  async function req(url, opt) {
    const r = await fetch(url, opt);
    let data = null;
    try { data = await r.json(); } catch { /* 非 JSON */ }
    if (!r.ok) throw new Error((data && data.error) || ('请求失败 ' + r.status));
    return data;
  }
  const jsonReq = (url, method, body) => req(url, {
    method, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });

  // ---------- 统计 ----------
  function countWords(s) { return String(s || '').replace(/\s+/g, '').length; }
  function summary(n) {
    let w = 0;
    (n.chapters || []).forEach(c => w += countWords(c.content));
    return {
      id: n.id, title: n.title || '未命名', chapterCount: (n.chapters || []).length,
      wordCount: w, createdAt: n.createdAt, updatedAt: n.updatedAt,
      deleted: !!n.deleted, deletedAt: n.deletedAt || null
    };
  }

  // ================= 小说 =================
  async function listNovels(scope) {
    scope = scope || 'active';
    if (mode === 'server') {
      const d = await req(`api/novels?scope=${scope}`);
      return d.list || [];
    }
    const all = await idbAll('novels');
    const list = all.map(summary);
    list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    if (scope === 'active') return list.filter(n => !n.deleted);
    if (scope === 'trash') return list.filter(n => n.deleted);
    return list;
  }

  async function getNovel(id) {
    if (mode === 'server') {
      const d = await req('api/novels/' + encodeURIComponent(id));
      return d.novel;
    }
    return idbGet('novels', id);
  }

  async function saveNovel(novel) {
    novel.updatedAt = new Date().toISOString();
    if (mode === 'server') {
      const d = await jsonReq('api/novels/' + encodeURIComponent(novel.id), 'PUT', novel);
      return d.novel;
    }
    await idbPut('novels', novel);
    return summary(novel);
  }

  async function createNovel(title, chapters) {
    const n = {
      id: uid(), title: title || '未命名', createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(), deleted: false, deletedAt: null,
      settings: { fontSize: 17, fontColor: '#000000', lineHeight: 1.9, fontFamily: '默认', editorTheme: 'light' },
      chapters: chapters || [], characters: [], relations: []
    };
    if (mode === 'server') {
      const d = await jsonReq('api/novels', 'POST', n);
      return { id: d.novel.id, summary: d.novel };
    }
    await idbPut('novels', n);
    return { id: n.id, summary: summary(n) };
  }

  async function softDelete(id) {
    if (mode === 'server') { await req('api/novels/' + encodeURIComponent(id), { method: 'DELETE' }); return; }
    const n = await idbGet('novels', id);
    if (n) { n.deleted = true; n.deletedAt = new Date().toISOString(); n.updatedAt = n.deletedAt; await idbPut('novels', n); }
  }

  async function restoreNovel(id) {
    if (mode === 'server') { await jsonReq('api/novels/' + encodeURIComponent(id) + '/restore', 'POST'); return; }
    const n = await idbGet('novels', id);
    if (n) { n.deleted = false; n.deletedAt = null; await idbPut('novels', n); }
  }

  async function permanentDelete(id) {
    if (mode === 'server') { await req('api/novels/' + encodeURIComponent(id) + '/permanent', { method: 'DELETE' }); return; }
    await idbDel('novels', id);
  }

  // ================= 视频 =================
  async function listVideos(kw) {
    if (mode === 'server') {
      const d = await req('api/videos' + (kw ? '?q=' + encodeURIComponent(kw) : ''));
      return d.list || [];
    }
    let list = await idbAll('videos');
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (kw) {
      kw = kw.toLowerCase();
      list = list.filter(v => (v.title + ' ' + (v.fileName || '') + ' ' + (v.url || '')).toLowerCase().includes(kw));
    }
    return list;
  }

  async function addVideoLink(title, url, category) {
    const cat = category || '其他';
    const meta = { id: uid(), title, url, fileName: '', size: 0, type: 'link', category: cat, createdAt: new Date().toISOString(), isLink: true };
    if (mode === 'server') {
      const d = await jsonReq('api/videos/link', 'POST', { title, url, category: cat });
      return d.video;
    }
    await idbPut('videos', meta);
    return meta;
  }

  /* 导入视频文件：
   *  server 模式 -> 原始二进制上传到服务器
   *  local  模式 -> Blob 存入浏览器 IndexedDB
   *  返回 { video, promise, abort }  */
  function importVideo(file, category, onProgress) {
    const cat = category || '其他';
    if (mode === 'server') {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'api/videos/import?name=' + encodeURIComponent(file.name) + '&category=' + encodeURIComponent(cat));
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.upload.onprogress = e => { if (onProgress && e.lengthComputable) onProgress(e.loaded / e.total); };
      const p = new Promise((res, rej) => {
        xhr.onload = () => {
          try { res(JSON.parse(xhr.responseText).video); } catch { rej(new Error('上传失败')); }
        };
        xhr.onerror = () => rej(new Error('上传失败'));
        xhr.send(file);
      });
      return { promise: p, abort: () => xhr.abort() };
    }
    const meta = {
      id: uid(), title: file.name.replace(/\.[^.]+$/, '') || '视频', fileName: file.name,
      size: file.size, type: file.type || 'video/mp4', category: cat, createdAt: new Date().toISOString(), isLink: false
    };
    const p = (async () => {
      await idbPut('blobs', { id: meta.id, blob: file });
      await idbPut('videos', meta);
      return meta;
    })();
    return { promise: p, abort: () => { /* IDB 无法中止 */ } };
  }

  async function updateVideo(id, patch) {
    if (mode === 'server') {
      const d = await jsonReq('api/videos/' + encodeURIComponent(id), 'PUT', patch);
      return d.video;
    }
    const v = await idbGet('videos', id);
    if (!v) throw new Error('视频不存在');
    if (patch.title) v.title = String(patch.title).slice(0, 200);
    if (patch.category) v.category = String(patch.category).slice(0, 20);
    await idbPut('videos', v);
    return v;
  }

  async function deleteVideo(id) {
    if (mode === 'server') { await req('api/videos/' + encodeURIComponent(id), { method: 'DELETE' }); return; }
    await idbDel('blobs', id);
    await idbDel('videos', id);
  }

  /* 播放/导出用的 URL；local 模式返回 Blob URL（需用后由页面 revoke） */
  async function videoFileUrl(id) {
    if (mode === 'server') return 'api/videos/' + encodeURIComponent(id) + '/file';
    const b = await idbGet('blobs', id);
    return b && b.blob ? URL.createObjectURL(b.blob) : '';
  }
  async function videoDownloadUrl(id) {
    if (mode === 'server') return 'api/videos/' + encodeURIComponent(id) + '/download';
    const b = await idbGet('blobs', id);
    return b && b.blob ? URL.createObjectURL(b.blob) : '';
  }

  // ================= 导出 / 导入 TXT =================
  function novelToTxt(novel) {
    const parts = ['《' + (novel.title || '未命名') + '》\n'];
    (novel.chapters || []).forEach(c => {
      parts.push('\n' + (c.title || '') + '\n\n' + (c.content || '') + '\n');
    });
    return parts.join('').replace(/\n{4,}/g, '\n\n').trim() + '\n';
  }

  async function exportNovelTxt(id) {
    const n = await getNovel(id);
    if (!n) throw new Error('小说不存在');
    downloadText(novelToTxt(n), (n.title || '小说') + '.txt');
    return n;
  }

  async function exportAllTxt() {
    const list = await listNovels('active');
    if (!list.length) { toast('还没有小说可导出', 'warn'); return 0; }
    const parts = ['IronWeb 全部小说导出\n导出时间：' + fmtTime(new Date().toISOString()) + '\n'];
    for (const s of list) {
      const n = await getNovel(s.id);
      if (n) parts.push('\n\n====================\n' + novelToTxt(n) + '\n====================');
    }
    const d = new Date();
    const pad = x => String(x).padStart(2, '0');
    downloadText(parts.join(''), `IronWeb-全部小说-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.txt`);
    return list.length;
  }

  /* 解析 TXT 文本为章节数组 */
  function parseTxtToChapters(content) {
    const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');
    const chapters = [];
    const pre = [];
    let cur = null;
    const re = /^\s*(第[0-9０-９〇一二三四五六七八九十百千万零两]+[章节回卷部篇][^\n]{0,60}|序章|楔子|引子|前言|后记|尾声|番外[^\n]{0,30})\s*$/;
    for (const raw of lines) {
      const trimmed = raw.trim();
      if (re.test(raw) && trimmed.length <= 80) {
        if (cur) chapters.push(cur);
        cur = { id: uid(), title: trimmed, content: '' };
      } else if (cur) {
        cur.content += (cur.content ? '\n' : '') + raw;
      } else {
        pre.push(raw);
      }
    }
    if (cur) chapters.push(cur);
    const prelude = pre.join('\n').trim();
    if (prelude && chapters.length) chapters.unshift({ id: uid(), title: '开头', content: prelude });
    if (!chapters.length) chapters.push({ id: uid(), title: prelude ? '正文' : '正文', content: prelude });
    chapters.forEach(c => { c.content = (c.content || '').trim(); });
    return chapters.filter(c => c.title || c.content);
  }

  async function importNovelTxt(title, content) {
    const chapters = parseTxtToChapters(content);
    if (!chapters.length) throw new Error('内容为空，无法导入');
    const r = await createNovel(title || '导入的小说', chapters);
    toast(`导入成功：${chapters.length} 个章节`, 'ok');
    return r;
  }

  // ---------- 首页统计 ----------
  async function stats() {
    const novels = await listNovels('active');
    const videos = await listVideos();
    return { novels: novels.length, videos: videos.length };
  }

  return {
    detect, getMode,
    listNovels, getNovel, saveNovel, createNovel, softDelete, restoreNovel, permanentDelete,
    listVideos, addVideoLink, importVideo, updateVideo, deleteVideo, videoFileUrl, videoDownloadUrl,
    novelToTxt, exportNovelTxt, exportAllTxt, parseTxtToChapters, importNovelTxt,
    stats
  };
})();
