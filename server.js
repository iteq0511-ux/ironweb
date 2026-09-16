/* ============================================================
 * IronWeb Server —— 零依赖 Node.js 后端
 * ------------------------------------------------------------
 * 功能：
 *   1. 静态托管 public/ 前端页面
 *   2. 小说数据 API（增删改查、回收站、恢复、永久删除）
 *   3. 视频库 API（文件导入、链接导入、搜索、流播放、导出、删除）
 *   4. 数据自动保存到本地 data/ 目录（即用户电脑 Web 目录下）
 * 运行：node server.js  （或双击 start.bat）
 * 说明：本服务不需要 npm install，直接运行即可。
 * ============================================================ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.IRONWEB_DATA || path.join(ROOT, 'data');
const NOVELS_DIR = path.join(DATA_DIR, 'novels');
const VIDEOS_DIR = path.join(DATA_DIR, 'videos');
const VIDEOS_META_FILE = path.join(VIDEOS_DIR, 'meta.json');
const PORT = Number(process.env.PORT) || 3000;

// ---------- 初始化目录 ----------
fs.mkdirSync(NOVELS_DIR, { recursive: true });
fs.mkdirSync(VIDEOS_DIR, { recursive: true });
if (!fs.existsSync(VIDEOS_META_FILE)) fs.writeFileSync(VIDEOS_META_FILE, '[]', 'utf8');

// ---------- 基础工具 ----------
function uuid() { return crypto.randomUUID(); }
function now() { return new Date().toISOString(); }

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJsonAtomic(file, data) {
  const tmp = file + '.' + process.pid + '.' + Date.now() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1), 'utf8');
  fs.renameSync(tmp, file);
}

function safeFileId(name) {
  // 只保留安全字符，防止路径穿越
  const base = String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
  return base.slice(0, 120) || 'file';
}

const EXT_BY_TYPE = {
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
  'video/x-matroska': '.mkv', 'video/mpeg': '.mpeg', 'video/x-msvideo': '.avi',
  'video/x-flv': '.flv', 'video/x-ms-wmv': '.wmv', 'video/3gpp': '.3gp',
  'video/mp2t': '.ts', 'audio/mp4': '.m4a', 'audio/mpeg': '.mp3',
  'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/webm': '.weba'
};
function extFor(contentType, originalName) {
  const fromType = EXT_BY_TYPE[String(contentType || '').split(';')[0].trim().toLowerCase()];
  if (fromType) return fromType;
  const m = /\.([a-z0-9]{1,5})$/i.exec(String(originalName || ''));
  const ext = m ? m[1].toLowerCase() : '';
  if (['mp4','webm','mov','mkv','mpeg','avi','flv','wmv','m4v','3gp','ts','m4a','mp3','wav','ogv'].includes(ext)) return '.' + ext;
  return '.mp4';
}

function countWords(s) { return String(s || '').replace(/\s+/g, '').length; }

// ---------- 小说存储 ----------
function novelFile(id) { return path.join(NOVELS_DIR, safeFileId(id) + '.json'); }

function loadNovel(id) {
  const f = novelFile(id);
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}
function saveNovel(novel) {
  novel.updatedAt = now();
  writeJsonAtomic(novelFile(novel.id), novel);
  return novel;
}
function deleteNovelFile(id) {
  const f = novelFile(id);
  if (fs.existsSync(f)) fs.unlinkSync(f);
}
function listNovelFiles() {
  return fs.readdirSync(NOVELS_DIR).filter(f => f.endsWith('.json'));
}

function summaryOf(n) {
  const chapters = Array.isArray(n.chapters) ? n.chapters : [];
  let words = 0;
  for (const c of chapters) words += countWords(c.content);
  return {
    id: n.id, title: n.title || '未命名', chapterCount: chapters.length,
    wordCount: words, createdAt: n.createdAt, updatedAt: n.updatedAt,
    deleted: !!n.deleted, deletedAt: n.deletedAt || null
  };
}

function normalizeNovel(body, existing) {
  const base = existing || {};
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : (base.title || '未命名');
  const settings = (body.settings && typeof body.settings === 'object') ? {
    fontSize: Number(body.settings.fontSize) || 17,
    fontColor: typeof body.settings.fontColor === 'string' ? body.settings.fontColor.slice(0, 30) : '#000000',
    lineHeight: Number(body.settings.lineHeight) || 1.9,
    fontFamily: typeof body.settings.fontFamily === 'string' ? body.settings.fontFamily.slice(0, 50) : '默认',
    editorTheme: body.settings.editorTheme === 'dark' ? 'dark' : 'light'
  } : (base.settings || { fontSize: 17, fontColor: '#000000', lineHeight: 1.9, fontFamily: '默认', editorTheme: 'light' });

  const cleanArr = (v, max) => Array.isArray(v) ? v.slice(0, max || 2000) : [];

  const chapters = cleanArr(body.chapters).map(c => ({
    id: String(c.id || uuid()).slice(0, 64),
    title: String(c.title || '未命名章节').slice(0, 200),
    content: String(c.content || '')
  }));
  const characters = cleanArr(body.characters).map(c => ({
    id: String(c.id || uuid()).slice(0, 64),
    name: String(c.name || '未命名').slice(0, 100),
    desc: String(c.desc || '').slice(0, 2000),
    color: String(c.color || '#f5a524').slice(0, 30)
  }));
  const relations = cleanArr(body.relations).map(r => ({
    id: String(r.id || uuid()).slice(0, 64),
    from: String(r.from || '').slice(0, 64),
    to: String(r.to || '').slice(0, 64),
    type: String(r.type || '关系').slice(0, 50)
  }));

  return {
    id: base.id || uuid(),
    title: title || '未命名',
    createdAt: base.createdAt || now(),
    updatedAt: now(),
    deleted: !!base.deleted,
    deletedAt: base.deletedAt || null,
    settings, chapters, characters, relations
  };
}

// ---------- 视频存储 ----------
function loadVideoMeta() { return readJson(VIDEOS_META_FILE, []); }
function saveVideoMeta(list) { writeJsonAtomic(VIDEOS_META_FILE, list); }
function videoFilePath(meta) {
  return path.join(VIDEOS_DIR, meta.storedName);
}

// ---------- HTTP 工具 ----------
function sendJson(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}
function sendText(res, code, text, type) {
  res.writeHead(code, { 'Content-Type': (type || 'text/plain') + '; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(text);
}

function readJsonBody(req, limitMB) {
  return new Promise((resolve, reject) => {
    const limit = (limitMB || 64) * 1024 * 1024;
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (e) { reject(new Error('JSON 解析失败')); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json'
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https: http:; media-src 'self' blob: https: http:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'"
};

function serveStatic(req, res, urlPath) {
  let rel = urlPath === '/' ? '/index.html' : urlPath;
  let file = path.resolve(PUBLIC_DIR, '.' + rel);
  if (!file.startsWith(path.resolve(PUBLIC_DIR))) { sendText(res, 403, 'Forbidden'); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    else { sendText(res, 404, '404 Not Found'); return; }
  }
  const ext = path.extname(file).toLowerCase();
  const body = fs.readFileSync(file);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': 'no-cache',
    ...SECURITY_HEADERS
  });
  res.end(body);
}

// ---------- 视频流播放（支持拖动进度条 Range） ----------
function serveVideoStream(req, res, meta) {
  const file = videoFilePath(meta);
  if (!fs.existsSync(file)) { sendJson(res, 404, { ok: false, error: '视频文件不存在' }); return; }
  const stat = fs.statSync(file);
  const type = meta.type || 'video/mp4';
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] !== '' ? parseInt(m[1], 10) : 0;
    let end = m && m[2] !== '' ? parseInt(m[2], 10) : stat.size - 1;
    if (isNaN(start) || start < 0) start = 0;
    if (isNaN(end) || end >= stat.size) end = stat.size - 1;
    if (start > end) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); res.end(); return; }
    res.writeHead(206, {
      'Content-Type': type, 'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store', ...SECURITY_HEADERS
    });
    fs.createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store', ...SECURITY_HEADERS
    });
    fs.createReadStream(file).pipe(res);
  }
}

// ---------- 路由 ----------
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const p = u.pathname;
  const seg = p.split('/').filter(Boolean);
  const method = req.method;
  const q = u.searchParams;

  try {
    // ===== 健康检查 =====
    if (p === '/api/health' && method === 'GET') {
      return sendJson(res, 200, { ok: true, app: 'IronWeb', mode: 'server', time: now(), dataDir: DATA_DIR });
    }

    // ===== 小说 =====
    if (p === '/api/novels' && method === 'GET') {
      const scope = q.get('scope') || 'active'; // active | trash | all
      const list = listNovelFiles().map(f => summaryOf(loadNovel(path.basename(f, '.json')))).filter(Boolean);
      const filtered = scope === 'active' ? list.filter(n => !n.deleted)
        : scope === 'trash' ? list.filter(n => n.deleted) : list;
      filtered.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      return sendJson(res, 200, { ok: true, list: filtered });
    }

    if (p === '/api/novels' && method === 'POST') {
      const body = await readJsonBody(req, 64);
      const novel = normalizeNovel(body, null);
      saveNovel(novel);
      return sendJson(res, 201, { ok: true, novel: summaryOf(novel) });
    }

    const novelMatch = /^\/api\/novels\/([^/]+)(\/[^/]+)?$/.exec(p);
    if (novelMatch) {
      const id = novelMatch[1];
      const action = novelMatch[2] || '';
      const novel = loadNovel(id);
      if (!novel) return sendJson(res, 404, { ok: false, error: '小说不存在' });
      if (action === '' && method === 'POST') return sendJson(res, 405, { ok: false, error: '方法不允许' });

      if (action === '' && method === 'GET') return sendJson(res, 200, { ok: true, novel });
      if (action === '' && method === 'PUT') {
        const body = await readJsonBody(req, 64);
        const merged = normalizeNovel(body, novel);
        merged.id = id;
        saveNovel(merged);
        return sendJson(res, 200, { ok: true, novel: summaryOf(merged), savedAt: merged.updatedAt });
      }
      if (action === '' && method === 'DELETE') { // 软删除 → 回收站
        novel.deleted = true; novel.deletedAt = now();
        saveNovel(novel);
        return sendJson(res, 200, { ok: true, deleted: true });
      }
      if (action === '/restore' && method === 'POST') {
        novel.deleted = false; novel.deletedAt = null;
        saveNovel(novel);
        return sendJson(res, 200, { ok: true, restored: true });
      }
      if (action === '/permanent' && method === 'DELETE') {
        deleteNovelFile(id);
        return sendJson(res, 200, { ok: true, permanent: true });
      }
    }

    // ===== 视频 =====
    if (p === '/api/videos' && method === 'GET') {
      let list = loadVideoMeta();
      const kw = (q.get('q') || '').trim().toLowerCase();
      if (kw) list = list.filter(v => (v.title + ' ' + v.fileName + ' ' + (v.url || '')).toLowerCase().includes(kw));
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return sendJson(res, 200, { ok: true, list });
    }

    if (p === '/api/videos/import' && method === 'POST') {
      // 原始二进制上传：POST /api/videos/import?name=xxx.mp4&category=动漫
      const originalName = safeFileId(q.get('name') || 'video.mp4');
      const contentType = req.headers['content-type'] || 'video/mp4';
      const category = String(q.get('category') || '').trim().slice(0, 20) || '其他';
      const id = uuid();
      const ext = extFor(contentType, originalName);
      const storedName = id + ext;
      const dest = path.join(VIDEOS_DIR, storedName);
      const size = await new Promise((resolve, reject) => {
        const ws = fs.createWriteStream(dest);
        let bytes = 0;
        req.on('data', c => { bytes += c.length; });
        req.on('error', e => { ws.destroy(); reject(e); });
        ws.on('error', e => reject(e));
        ws.on('finish', () => resolve(bytes));
        req.pipe(ws);
      });
      const title = originalName.replace(/\.[a-z0-9]+$/i, '');
      const meta = { id, title, fileName: originalName, storedName, size, type: contentType.split(';')[0].trim(), category, createdAt: now(), isLink: false };
      const list = loadVideoMeta();
      list.push(meta);
      saveVideoMeta(list);
      return sendJson(res, 201, { ok: true, video: meta });
    }

    if (p === '/api/videos/link' && method === 'POST') {
      const body = await readJsonBody(req, 2);
      const url = String(body.url || '').trim();
      const title = String(body.title || '').trim().slice(0, 200) || '视频链接';
      const category = String(body.category || '').trim().slice(0, 20) || '其他';
      if (!/^https?:\/\//i.test(url)) return sendJson(res, 400, { ok: false, error: '请输入有效的 http(s) 链接' });
      const id = uuid();
      const meta = { id, title, url, fileName: '', size: 0, type: 'link', category, createdAt: now(), isLink: true };
      const list = loadVideoMeta();
      list.push(meta);
      saveVideoMeta(list);
      return sendJson(res, 201, { ok: true, video: meta });
    }

    const videoMatch = /^\/api\/videos\/([^/]+)(\/[^/]+)?$/.exec(p);
    if (videoMatch) {
      const id = videoMatch[1];
      const action = videoMatch[2] || '';
      const list = loadVideoMeta();
      const meta = list.find(v => v.id === id);
      if (!meta) return sendJson(res, 404, { ok: false, error: '视频不存在' });

      if (action === '/file' && method === 'GET') return serveVideoStream(req, res, meta);
      if (action === '/download' && method === 'GET') {
        if (meta.isLink) return sendJson(res, 400, { ok: false, error: '链接视频请直接打开原链接', url: meta.url });
        const file = videoFilePath(meta);
        if (!fs.existsSync(file)) return sendJson(res, 404, { ok: false, error: '文件已丢失' });
        const stat = fs.statSync(file);
        res.writeHead(200, {
          'Content-Type': meta.type || 'application/octet-stream',
          'Content-Length': stat.size,
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(meta.fileName || meta.title)}`,
          'Cache-Control': 'no-store', ...SECURITY_HEADERS
        });
        return fs.createReadStream(file).pipe(res);
      }
      if (action === '' && method === 'PUT') { // 更新元信息（标题 / 分类）
        const body = await readJsonBody(req, 2);
        const next = { ...meta };
        if (typeof body.title === 'string' && body.title.trim()) next.title = body.title.trim().slice(0, 200);
        if (typeof body.category === 'string' && body.category.trim()) next.category = body.category.trim().slice(0, 20);
        saveVideoMeta(list.map(v => v.id === id ? next : v));
        return sendJson(res, 200, { ok: true, video: next });
      }
      if (action === '' && method === 'DELETE') {
        if (!meta.isLink) {
          const file = videoFilePath(meta);
          if (fs.existsSync(file)) fs.unlinkSync(file);
        }
        saveVideoMeta(list.filter(v => v.id !== id));
        return sendJson(res, 200, { ok: true, deleted: true });
      }
    }

    // ===== 静态资源 =====
    if (p.startsWith('/api/')) return sendJson(res, 404, { ok: false, error: '接口不存在' });
    if (method === 'GET' || method === 'HEAD') return serveStatic(req, res, p);

    return sendText(res, 405, 'Method Not Allowed');
  } catch (e) {
    if (e.message === 'JSON 解析失败' || e.message === '请求体过大') return sendJson(res, 400, { ok: false, error: e.message });
    console.error('[IronWeb] 服务器错误:', e);
    return sendJson(res, 500, { ok: false, error: '服务器内部错误' });
  }
});

server.listen(PORT, () => {
  console.log('==============================================');
  console.log('  IronWeb 已启动');
  console.log('  本机访问: http://localhost:' + PORT);
  console.log('  数据目录: ' + DATA_DIR);
  console.log('  小说保存: ' + NOVELS_DIR);
  console.log('  视频保存: ' + VIDEOS_DIR);
  console.log('==============================================');
  // 仅在本地运行时自动打开浏览器（云端部署时跳过）
  if (!process.env.PORT && !process.env.RENDER && process.platform === 'win32') {
    setTimeout(() => {
      try { require('child_process').exec('start http://localhost:' + PORT); } catch { /* 忽略 */ }
    }, 400);
  }
});
