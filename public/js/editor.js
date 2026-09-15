/* IronWeb 小说编辑器 */
'use strict';

const DEFAULT_SETTINGS = { fontSize: 17, fontColor: '#e8edf3', lineHeight: 1.9, fontFamily: '默认', editorTheme: 'dark' };
const CHAR_COLORS = ['#f5a524', '#5b8def', '#3fb27f', '#e5534b', '#9b6df2', '#e889a9', '#38b6c2', '#c98a3a'];
const REL_TYPES = ['朋友', '恋人', '夫妻', '父子', '母子', '兄弟姐妹', '师徒', '仇敌', '同事', '同学', '邻居', '主仆', '上司下属', '其他'];

let novel = null;
let curIdx = 0;
let dirty = false;
let saveTimer = null;
let editCharId = null; // 正在编辑的人物 id（null = 新建）
let graphSel = null;   // 图谱高亮的人物

function cnNum(n) {
  const d = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const u = ['', '十', '百', '千'];
  if (n <= 0) return '零';
  let s = '', c = 0;
  while (n > 0) { const m = n % 10; if (m) s = d[m] + u[c] + s; else if (s && !s.startsWith('零')) s = '零' + s; n = Math.floor(n / 10); c++; }
  return s.replace(/零+/g, '零').replace(/零$/, '');
}

document.addEventListener('DOMContentLoaded', async () => {
  bindModalClose();
  initIcons();
  await IronAPI.detect();

  const id = new URLSearchParams(location.search).get('id');
  if (!id) { location.href = 'novel.html'; return; }
  novel = await IronAPI.getNovel(id);
  if (!novel) { toast('小说不存在或已删除', 'err'); setTimeout(() => location.href = 'novel.html', 900); return; }
  novel.settings = Object.assign({}, DEFAULT_SETTINGS, novel.settings || {});
  if (!Array.isArray(novel.chapters)) novel.chapters = [];
  if (!novel.chapters.length) novel.chapters = [{ id: uid(), title: '第一章', content: '' }];
  if (!Array.isArray(novel.characters)) novel.characters = [];
  if (!Array.isArray(novel.relations)) novel.relations = [];

  $('#novelTitle').value = novel.title || '';
  applySettings();
  renderChapters();
  renderChars();
  renderRelForm();
  renderRelations();
  loadChapter();

  // 保存位置说明
  const note = $('#saveNote');
  if (IronAPI.getMode() === 'server') {
    try {
      const h = await (await fetch('api/health')).json();
      note.innerHTML = '自动保存已开启：编辑内容会实时保存。<br>保存位置：' + esc(h.dataDir || '') + '\\novels';
    } catch { note.textContent = '自动保存已开启：编辑内容会实时保存到服务器。'; }
  } else {
    note.textContent = '自动保存已开启：数据保存在当前浏览器（IndexedDB），导出 TXT 可随时备份。';
  }
  setSaveStatus('ready', '已加载');

  bindEvents();
});

function initIcons() {
  $('#btnBack').innerHTML = icon('back', 20);
  $('#btnPanel').innerHTML = icon('list', 20);
  $('#btnImmersive').innerHTML = icon('pen', 17) + '写小说';
  $('#btnExitImmersive').innerHTML = icon('shrink', 17) + '退出沉浸';
  $('#btnSave').innerHTML = icon('save', 17) + '保存';
  $('#btnRead').innerHTML = icon('eye', 17) + '阅读';
  $('#btnAddChapter').innerHTML = icon('plus', 15) + '新建章节';
  $('#btnAddChar').innerHTML = icon('plus', 15) + '添加人物';
  $('#readerPrev').innerHTML = icon('arrowL', 17) + '上一章';
  $('#readerNext').innerHTML = '下一章' + icon('arrowR', 17);
  $('#readerQuit').innerHTML = icon('x', 17) + '退出阅读';
  document.querySelectorAll('.tabs .tab')[0].innerHTML = icon('list', 15) + '章节';
  document.querySelectorAll('.tabs .tab')[1].innerHTML = icon('users', 15) + '人物关系';
  document.querySelectorAll('.tabs .tab')[2].innerHTML = icon('gear', 15) + '设置';
  document.querySelectorAll('.modal-head .icon-btn').forEach(b => b.innerHTML = icon('x', 18));
}

/* ================= 保存 ================= */
function markDirty() {
  dirty = true;
  setSaveStatus('saving', '保存中…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 2000);
}
async function flushSave() {
  clearTimeout(saveTimer);
  if (!dirty || !novel) return;
  dirty = false;
  try {
    await IronAPI.saveNovel(novel);
    setSaveStatus('saved', '已保存 ' + fmtTime(new Date().toISOString()));
  } catch (e) {
    dirty = true;
    setSaveStatus('ready', '保存失败，将重试');
    toast('保存失败：' + (e.message || '网络错误'), 'err');
  }
}
function setSaveStatus(cls, text) {
  const el = $('#saveStatus');
  el.className = 'save-status ' + (cls === 'ready' ? '' : cls);
  el.textContent = text;
}
// 离开页面前兜底保存
window.addEventListener('pagehide', () => {
  if (!dirty || !novel) return;
  try {
    if (IronAPI.getMode() === 'server') {
      fetch('api/novels/' + encodeURIComponent(novel.id), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(novel), keepalive: true
      });
    } else {
      IronAPI.saveNovel(novel);
    }
  } catch { /* 忽略 */ }
});

/* ================= 章节 ================= */
function renderChapters() {
  const box = $('#chapterList');
  box.innerHTML = '';
  novel.chapters.forEach((c, i) => {
    const item = document.createElement('div');
    item.className = 'ch-item' + (i === curIdx ? ' active' : '');
    item.innerHTML = `
      <span class="ch-title" title="${esc(c.title)}">${esc(c.title)}</span>
      <span class="ch-words">${fmtNum(countWords(c.content))}字</span>
      <span class="ch-ops">
        <button class="ch-op" data-op="up" title="上移"></button>
        <button class="ch-op" data-op="down" title="下移"></button>
        <button class="ch-op" data-op="rename" title="重命名"></button>
        <button class="ch-op del" data-op="del" title="删除"></button>
      </span>`;
    item.querySelector('.ch-title').addEventListener('click', () => selectChapter(i));
    item.querySelector('.ch-ops').addEventListener('click', e => e.stopPropagation());
    item.querySelectorAll('[data-op="up"]')[0].innerHTML = icon('arrowL', 13);
    item.querySelectorAll('[data-op="down"]')[0].innerHTML = icon('arrowR', 13);
    item.querySelectorAll('[data-op="rename"]')[0].innerHTML = icon('pen', 13);
    item.querySelectorAll('[data-op="del"]')[0].innerHTML = icon('trash', 13);
    item.querySelector('[data-op="up"]').addEventListener('click', () => moveChapter(i, -1));
    item.querySelector('[data-op="down"]').addEventListener('click', () => moveChapter(i, 1));
    item.querySelector('[data-op="rename"]').addEventListener('click', () => renameChapter(i));
    item.querySelector('[data-op="del"]').addEventListener('click', () => delChapter(i));
    box.appendChild(item);
  });
}

async function selectChapter(i) {
  if (i === curIdx) return;
  await flushSave();
  curIdx = i;
  renderChapters();
  loadChapter();
}

function loadChapter() {
  const c = novel.chapters[curIdx];
  $('#chapterTitle').value = c.title || '';
  $('#ta').value = c.content || '';
  updateWords();
}

function updateWords() {
  $('#chapterWords').textContent = fmtNum(countWords($('#ta').value)) + ' 字';
  const active = $('#chapterList .ch-item.active .ch-words');
  if (active) active.textContent = fmtNum(countWords($('#ta').value)) + '字';
}

function addChapter() {
  const title = '第' + cnNum(novel.chapters.length + 1) + '章';
  novel.chapters.splice(curIdx + 1, 0, { id: uid(), title, content: '' });
  renderChapters();
  selectChapter(curIdx + 1);
  $('#ta').focus();
}

function renameChapter(i) {
  const t = prompt('章节标题', novel.chapters[i].title || '');
  if (t == null) return;
  novel.chapters[i].title = t.trim() || novel.chapters[i].title;
  if (i === curIdx) $('#chapterTitle').value = novel.chapters[i].title;
  renderChapters();
  markDirty();
}

function delChapter(i) {
  if (novel.chapters.length <= 1) { toast('至少需要保留一个章节', 'warn'); return; }
  if (!confirm(`删除章节「${novel.chapters[i].title}」？`)) return;
  novel.chapters.splice(i, 1);
  if (curIdx >= novel.chapters.length) curIdx = novel.chapters.length - 1;
  renderChapters();
  loadChapter();
  markDirty();
}

function moveChapter(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= novel.chapters.length) return;
  const t = novel.chapters[i]; novel.chapters[i] = novel.chapters[j]; novel.chapters[j] = t;
  if (curIdx === i) curIdx = j; else if (curIdx === j) curIdx = i;
  renderChapters();
  loadChapter();
  markDirty();
}

/* ================= 人物 ================= */
function renderChars() {
  const box = $('#charList');
  box.innerHTML = '';
  if (!novel.characters.length) {
    box.innerHTML = '<span class="rel-empty">还没有人物，点击下方按钮添加</span>';
    return;
  }
  novel.characters.forEach(ch => {
    const chip = document.createElement('button');
    chip.className = 'char-chip';
    chip.innerHTML = `<span class="c-dot" style="background:${esc(ch.color)}"></span>${esc(ch.name)}`;
    chip.addEventListener('click', () => openCharModal(ch.id));
    box.appendChild(chip);
  });
}

function openCharModal(id) {
  editCharId = id || null;
  const ch = id ? novel.characters.find(c => c.id === id) : null;
  $('#charModalTitle').textContent = ch ? '编辑人物' : '添加人物';
  $('#charName').value = ch ? ch.name : '';
  $('#charDesc').value = ch ? ch.desc : '';
  $('#btnDelChar').style.display = ch ? '' : 'none';
  // 颜色
  const sw = $('#charColors');
  sw.innerHTML = '';
  const curColor = ch ? ch.color : CHAR_COLORS[novel.characters.length % CHAR_COLORS.length];
  CHAR_COLORS.concat([curColor]).filter((v, i, a) => a.indexOf(v) === i).forEach(color => {
    const b = document.createElement('button');
    b.className = 'swatch' + (color === curColor ? ' active' : '');
    b.style.background = color;
    b.dataset.picked = color;
    b.addEventListener('click', () => {
      sw.querySelectorAll('.swatch').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    });
    sw.appendChild(b);
  });
  openModal('charModal');
}

function saveCharModal() {
  const name = $('#charName').value.trim();
  if (!name) { toast('请填写人物姓名', 'warn'); return; }
  const picked = $('#charColors').querySelector('.swatch.active');
  const color = picked && picked.dataset.picked ? picked.dataset.picked : CHAR_COLORS[novel.characters.length % CHAR_COLORS.length];
  if (editCharId) {
    const ch = novel.characters.find(c => c.id === editCharId);
    if (ch) { ch.name = name; ch.desc = $('#charDesc').value.trim(); ch.color = color; }
  } else {
    novel.characters.push({ id: uid(), name, desc: $('#charDesc').value.trim(), color });
  }
  closeModal('charModal');
  renderChars();
  renderRelForm();
  renderRelations();
  markDirty();
  toast(editCharId ? '人物已更新' : '人物已添加', 'ok');
}

function delCharModal() {
  if (!editCharId) return;
  const ch = novel.characters.find(c => c.id === editCharId);
  if (!ch) return;
  if (!confirm(`删除人物「${ch.name}」？相关关系也会一并删除。`)) return;
  novel.characters = novel.characters.filter(c => c.id !== editCharId);
  novel.relations = novel.relations.filter(r => r.from !== editCharId && r.to !== editCharId);
  if (graphSel === editCharId) graphSel = null;
  closeModal('charModal');
  renderChars(); renderRelForm(); renderRelations();
  markDirty();
  toast('人物已删除', 'ok');
}

/* ================= 关系 ================= */
function renderRelForm() {
  const from = $('#relFrom'), to = $('#relTo'), type = $('#relType');
  const opts = novel.characters.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  from.innerHTML = opts; to.innerHTML = opts;
  type.innerHTML = REL_TYPES.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
}

function addRelation() {
  if (novel.characters.length < 2) { toast('至少需要两个人物才能创建关系', 'warn'); return; }
  const from = $('#relFrom').value, to = $('#relTo').value;
  if (from === to) { toast('请选择两个不同的人物', 'warn'); return; }
  let type = $('#relType').value;
  if (type === '其他') {
    type = $('#relCustom').value.trim() || '其他';
  }
  novel.relations.push({ id: uid(), from, to, type });
  $('#relCustom').value = '';
  renderRelations();
  markDirty();
  toast('关系已添加', 'ok');
}

function renderRelations() {
  const box = $('#relList');
  box.innerHTML = '';
  const nameOf = id => { const c = novel.characters.find(x => x.id === id); return c ? c.name : '?'; };
  if (!novel.relations.length) {
    box.innerHTML = '<div class="rel-empty">暂无关系，选择两个人物创建关系</div>';
    $('#graphWrap').style.display = 'none';
    return;
  }
  novel.relations.forEach(r => {
    const row = document.createElement('div');
    row.className = 'rel-item';
    row.innerHTML = `
      <span class="rel-text">
        <span class="nm">${esc(nameOf(r.from))}</span>
        <span class="rel-arrow">→</span>
        <span class="rel-type">${esc(r.type)}</span>
        <span class="rel-arrow">→</span>
        <span class="nm">${esc(nameOf(r.to))}</span>
      </span>
      <button class="ch-op del" title="删除关系"></button>`;
    row.querySelector('.ch-op').innerHTML = icon('trash', 13);
    row.querySelector('.ch-op').addEventListener('click', () => {
      novel.relations = novel.relations.filter(x => x.id !== r.id);
      renderRelations(); markDirty(); toast('关系已删除', 'ok');
    });
    box.appendChild(row);
  });
  $('#graphWrap').style.display = 'block';
  drawGraph();
}

/* 关系图谱（圆形布局） */
function drawGraph() {
  const svg = $('#relGraph');
  if (!svg) return;
  const W = 300, H = 260, cx = W / 2, cy = H / 2 - 6, R = 92;
  const chars = novel.characters;
  const pos = {};
  chars.forEach((c, i) => {
    const a = (i / Math.max(chars.length, 1)) * Math.PI * 2 - Math.PI / 2;
    pos[c.id] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
  });
  let html = '<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#f5a524"/></marker></defs>';
  // 边
  novel.relations.forEach(r => {
    const p1 = pos[r.from], p2 = pos[r.to];
    if (!p1 || !p2) return;
    const dim = graphSel && graphSel !== r.from && graphSel !== r.to ? ' opacity:.18' : '';
    html += `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="#f5a524" stroke-width="1.6" marker-end="url(#arr)"${dim}/>`;
    const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
    html += `<text x="${mx}" y="${my - 4}" font-size="9" fill="#ffcf7a" text-anchor="middle"${dim}>${esc(r.type)}</text>`;
  });
  // 节点
  chars.forEach(c => {
    const p = pos[c.id];
    const dim = graphSel && graphSel !== c.id ? ' opacity:.25' : '';
    const hl = graphSel === c.id ? ' stroke:#fff stroke-width:2.4' : '';
    html += `<circle cx="${p.x}" cy="${p.y}" r="17" fill="${esc(c.color)}"${hl}${dim} data-char="${esc(c.id)}" class="g-node" style="cursor:pointer"/>`;
    html += `<text x="${p.x}" y="${p.y + 31}" font-size="11" fill="#e8edf3" text-anchor="middle"${dim}>${esc(c.name)}</text>`;
  });
  svg.innerHTML = html;
  svg.querySelectorAll('.g-node').forEach(n => n.addEventListener('click', () => {
    graphSel = graphSel === n.dataset.char ? null : n.dataset.char;
    drawGraph();
  }));
}

/* ================= 设置 ================= */
function applySettings() {
  const s = novel.settings;
  const ta = $('#ta');
  const size = s.fontSize || 17;
  ta.style.fontSize = size + 'px';
  ta.style.lineHeight = s.lineHeight || 1.9;
  ta.style.color = s.fontColor || '#e8edf3';
  const map = { '默认': '', '宋体': 'SimSun, serif', '楷体': 'KaiTi, serif', '黑体': 'SimHei, sans-serif', '微软雅黑': '"Microsoft YaHei", sans-serif' };
  ta.style.fontFamily = map[s.fontFamily] || '';
  document.body.classList.toggle('light-theme', s.editorTheme === 'light');
  $('#setFontSize').value = size;
  $('#setFontSizeVal').textContent = size;
  $('#setLineHeight').value = s.lineHeight || 1.9;
  $('#setLineHeightVal').textContent = Number(s.lineHeight || 1.9).toFixed(2);
  $('#setFontFamily').value = s.fontFamily || '默认';
  $('#setFontColor').value = s.fontColor || '#e8edf3';
  // 颜色色板
  const sw = $('#colorSwatches');
  sw.innerHTML = '';
  ['#e8edf3', '#ffffff', '#f5e6c4', '#a9d8b8', '#ff9d9d', '#9db8f5', '#f5a524'].forEach(color => {
    const b = document.createElement('button');
    b.className = 'swatch' + (color.toLowerCase() === (s.fontColor || '').toLowerCase() ? ' active' : '');
    b.style.background = color;
    b.addEventListener('click', () => {
      novel.settings.fontColor = color;
      applySettings(); markDirty();
    });
    sw.appendChild(b);
  });
  // 主题
  document.querySelectorAll('#setThemeSeg button').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === s.editorTheme);
  });
}

/* ================= 事件绑定 ================= */
function bindEvents() {
  $('#btnBack').addEventListener('click', async () => { await flushSave(); location.href = 'novel.html'; });
  $('#btnPanel').addEventListener('click', () => document.body.classList.add('panel-open'));
  $('#panelMask').addEventListener('click', () => document.body.classList.remove('panel-open'));
  $('#novelTitle').addEventListener('input', () => { novel.title = $('#novelTitle').value.trim() || '未命名'; markDirty(); });
  $('#chapterTitle').addEventListener('input', () => {
    novel.chapters[curIdx].title = $('#chapterTitle').value;
    renderChapters(); markDirty();
  });
  $('#ta').addEventListener('input', () => {
    novel.chapters[curIdx].content = $('#ta').value;
    updateWords(); markDirty();
  });
  $('#btnAddChapter').addEventListener('click', addChapter);
  $('#btnSave').addEventListener('click', async () => {
    setSaveStatus('saving', '保存中…');
    await flushSave();
    if (!dirty) setSaveStatus('saved', '已保存 ' + fmtTime(new Date().toISOString()));
    toast('已保存', 'ok');
  });

  // 沉浸写作
  $('#btnImmersive').addEventListener('click', () => {
    document.body.classList.add('immersive');
    $('#btnExitImmersive').style.display = 'flex';
    document.body.classList.remove('panel-open');
    setTimeout(() => $('#ta').focus(), 350);
  });
  $('#btnExitImmersive').addEventListener('click', () => {
    document.body.classList.remove('immersive');
    $('#btnExitImmersive').style.display = 'none';
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.body.classList.contains('immersive')) {
      document.body.classList.remove('immersive');
      $('#btnExitImmersive').style.display = 'none';
    }
  });

  // 设置
  $('#setFontSize').addEventListener('input', () => { novel.settings.fontSize = +$('#setFontSize').value; applySettings(); markDirty(); });
  $('#setLineHeight').addEventListener('input', () => { novel.settings.lineHeight = +$('#setLineHeight').value; applySettings(); markDirty(); });
  $('#setFontFamily').addEventListener('change', () => { novel.settings.fontFamily = $('#setFontFamily').value; applySettings(); markDirty(); });
  $('#setFontColor').addEventListener('input', () => { novel.settings.fontColor = $('#setFontColor').value; applySettings(); markDirty(); });
  $('#setThemeSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    novel.settings.editorTheme = b.dataset.theme;
    applySettings(); markDirty();
  });

  // 人物
  $('#btnAddChar').addEventListener('click', () => openCharModal(null));
  $('#btnSaveChar').addEventListener('click', saveCharModal);
  $('#btnDelChar').addEventListener('click', delCharModal);
  $('#btnAddRel').addEventListener('click', addRelation);
  $('#relType').addEventListener('change', () => {
    $('#relCustom').style.display = $('#relType').value === '其他' ? '' : 'none';
  });
  $('#relCustom').style.display = 'none';

  // 阅读
  $('#btnRead').addEventListener('click', () => openReader(curIdx));
  $('#readerPrev').addEventListener('click', () => { if (curIdx > 0) { curIdx--; openReader(curIdx); } });
  $('#readerNext').addEventListener('click', () => { if (curIdx < novel.chapters.length - 1) { curIdx++; openReader(curIdx); } });
  $('#readerQuit').addEventListener('click', closeReader);
  $('#reader').addEventListener('click', e => {
    if (e.target.closest('.reader-bar')) return;
    $('#reader').classList.toggle('controls-hidden');
  });
  document.addEventListener('keydown', e => {
    if (!$('#reader').classList.contains('open')) return;
    if (e.key === 'Escape') closeReader();
    if (e.key === 'ArrowLeft' && curIdx > 0) { curIdx--; openReader(curIdx); }
    if (e.key === 'ArrowRight' && curIdx < novel.chapters.length - 1) { curIdx++; openReader(curIdx); }
  });

  // Tab 切换
  document.querySelectorAll('.tabs .tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.tabs .tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    $('#pane-' + t.dataset.tab).classList.add('active');
    if (t.dataset.tab === 'characters') { renderRelForm(); renderRelations(); }
  }));
}

/* ================= 阅读 ================= */
async function openReader(i) {
  await flushSave();
  const c = novel.chapters[i];
  $('#readerTitle').textContent = c.title || '未命名章节';
  $('#readerSub').textContent = `${novel.title} · 共 ${novel.chapters.length} 章`;
  $('#readerContent').textContent = c.content || '（本章暂无内容）';
  $('#readerPos').textContent = `第 ${i + 1} / ${novel.chapters.length} 章`;
  $('#readerPrev').disabled = i <= 0;
  $('#readerNext').disabled = i >= novel.chapters.length - 1;
  $('#reader').classList.add('open');
  $('#reader').classList.remove('controls-hidden');
  document.body.classList.add('locked');
  $('#reader').querySelector('.reader-body').scrollTop = 0;
}

function closeReader() {
  $('#reader').classList.remove('open');
  document.body.classList.remove('locked');
}

function countWords(s) { return String(s || '').replace(/\s+/g, '').length; }
