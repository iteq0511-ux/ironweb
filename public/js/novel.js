/* IronWeb 小说区页面 */
'use strict';

const COVER_COLORS = [
  ['#f5a524', '#d97a0a'], ['#5b8def', '#3a5fc0'], ['#3fb27f', '#23805a'],
  ['#e5534b', '#a8352f'], ['#9b6df2', '#6f3fd0'], ['#e889a9', '#b84870'],
  ['#38b6c2', '#1c7f8a'], ['#c98a3a', '#96601f']
];

let novelList = [];

document.addEventListener('DOMContentLoaded', async () => {
  bindModalClose();
  // 图标
  $('#btnBack').innerHTML = icon('back', 20);
  $('#btnRefresh').innerHTML = icon('refresh', 18);
  $('#btnNew').innerHTML = icon('plus', 17) + '新建小说';
  $('#btnTrash').innerHTML = icon('trash', 17) + '回收站';
  $('#btnExportAll').innerHTML = icon('download', 17) + '导出全部 TXT';
  $('#btnImport').innerHTML = icon('upload', 17) + '导入 TXT';
  document.querySelectorAll('[data-icon="search"]')[0].outerHTML = icon('search', 16);
  document.querySelectorAll('[data-icon="book"]')[0].outerHTML = icon('book', 54);
  document.querySelectorAll('[data-icon="trash"]')[0].outerHTML = icon('trash', 54);
  $('.modal-head .icon-btn').innerHTML = icon('x', 18);
  $('[data-close="trashModal"]').innerHTML = icon('x', 18);

  await IronAPI.detect();
  $('#modeText').textContent = IronAPI.getMode() === 'server' ? '本地服务模式' : '浏览器模式';

  $('#btnBack').addEventListener('click', () => location.href = 'index.html');
  $('#btnRefresh').addEventListener('click', load);
  $('#btnImport').addEventListener('click', () => openModal('importModal'));
  $('#btnNew').addEventListener('click', createNewNovel);
  $('#btnTrash').addEventListener('click', openTrash);
  $('#btnExportAll').addEventListener('click', async () => {
    const n = await IronAPI.exportAllTxt();
    if (n) toast(`已导出 ${n} 本小说`, 'ok');
  });
  $('#btnImportGo').addEventListener('click', doImport);
  $('#searchInput').addEventListener('input', render);
  $('#importFile').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    if (!/\.txt$/i.test(f.name)) { toast('请选择 .txt 文件', 'warn'); return; }
    if (!$('#importTitle').value.trim()) $('#importTitle').value = f.name.replace(/\.txt$/i, '');
    const reader = new FileReader();
    reader.onload = () => { $('#importText').value = String(reader.result || '').slice(0, 2_000_000); toast('已读取文件内容', 'ok'); };
    reader.readAsText(f, 'utf-8');
  });

  await load();
});

async function load() {
  novelList = await IronAPI.listNovels('active');
  render();
  updateTrashCount();
}

/* ---------- 新建小说 ---------- */
async function createNewNovel() {
  const title = prompt('给新小说起个名字（可留空，之后在编辑器里改）：', '');
  if (title === null) return;
  const name = (title || '').trim() || '未命名小说';
  const btn = $('#btnNew');
  btn.disabled = true;
  try {
    const r = await IronAPI.createNovel(name);
    toast('已创建《' + r.summary.title + '》，进入编辑器', 'ok');
    location.href = 'editor.html?id=' + encodeURIComponent(r.id);
  } catch (e) {
    toast(e.message || '创建失败', 'err');
  } finally {
    btn.disabled = false;
  }
}

function updateTrashCount() {
  IronAPI.listNovels('trash').then(list => {
    $('#btnTrash').lastChild.textContent = '回收站' + (list.length ? ` (${list.length})` : '');
  });
}

function render() {
  const kw = $('#searchInput').value.trim().toLowerCase();
  const list = kw ? novelList.filter(n => n.title.toLowerCase().includes(kw)) : novelList;
  const grid = $('#novelGrid');
  grid.innerHTML = '';
  $('#novelCount').textContent = `${novelList.length} 本`;
  $('#emptyBox').style.display = list.length ? 'none' : 'block';
  if (kw && !list.length) {
    $('#emptyBox').style.display = 'block';
    $('#emptyBox').querySelector('h3').textContent = '没有找到匹配的小说';
    $('#emptyBox').querySelector('p').textContent = '换个关键词试试';
  } else if (!kw) {
    $('#emptyBox').querySelector('h3').textContent = '还没有小说';
    $('#emptyBox').querySelector('p').textContent = '点击右上角「导入 TXT」导入已有作品，或先导入一本再开始创作';
  }

  list.forEach((n, i) => {
    const colors = COVER_COLORS[i % COVER_COLORS.length];
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-cover" style="background:linear-gradient(135deg,${colors[0]}33,${colors[1]}22)">
        <span class="initial">${esc((n.title || '?').slice(0, 1))}</span>
      </div>
      <div class="card-body">
        <div class="card-title" title="${esc(n.title)}">${esc(n.title)}</div>
        <div class="card-meta">
          <span>${n.chapterCount} 章</span><span>${fmtNum(n.wordCount)} 字</span><span>${fmtTime(n.updatedAt)}</span>
        </div>
        <div class="card-actions">
          <button class="btn primary sm" data-act="open">打开</button>
          <button class="btn sm" data-act="export">导出 TXT</button>
          <button class="btn danger sm" data-act="del">删除</button>
        </div>
      </div>`;
    card.querySelector('[data-act="open"]').addEventListener('click', () => location.href = 'editor.html?id=' + encodeURIComponent(n.id));
    card.querySelector('[data-act="export"]').addEventListener('click', async () => {
      await IronAPI.exportNovelTxt(n.id);
      toast('已导出', 'ok');
    });
    card.querySelector('[data-act="del"]').addEventListener('click', async () => {
      if (!confirm(`把《${n.title}》移入回收站？可在回收站中恢复。`)) return;
      await IronAPI.softDelete(n.id);
      toast('已移入回收站', 'ok');
      load();
    });
    grid.appendChild(card);
  });
}

/* ---------- 回收站 ---------- */
async function openTrash() {
  openModal('trashModal');
  const list = await IronAPI.listNovels('trash');
  const box = $('#trashList');
  box.innerHTML = '';
  $('#trashEmpty').style.display = list.length ? 'none' : 'block';
  list.forEach(n => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--bg2)';
    row.innerHTML = `
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(n.title)}</div>
        <div style="font-size:12px;color:var(--muted)">删除于 ${fmtTime(n.deletedAt)} · ${n.chapterCount} 章 · ${fmtNum(n.wordCount)} 字</div>
      </div>
      <button class="btn sm" style="color:var(--ok)">恢复</button>
      <button class="btn sm danger">彻底删除</button>`;
    row.querySelectorAll('button')[0].addEventListener('click', async () => {
      await IronAPI.restoreNovel(n.id);
      toast('已恢复', 'ok');
      openTrash(); load();
    });
    row.querySelectorAll('button')[1].addEventListener('click', async () => {
      if (!confirm(`彻底删除《${n.title}》？此操作不可恢复。`)) return;
      await IronAPI.permanentDelete(n.id);
      toast('已彻底删除', 'ok');
      openTrash(); load();
    });
    box.appendChild(row);
  });
  updateTrashCount();
}

$('#btnEmptyTrash').addEventListener('click', async () => {
  const list = await IronAPI.listNovels('trash');
  if (!list.length) return;
  if (!confirm(`彻底删除回收站中全部 ${list.length} 本小说？此操作不可恢复。`)) return;
  for (const n of list) await IronAPI.permanentDelete(n.id);
  toast('回收站已清空', 'ok');
  openTrash(); load();
});

/* ---------- 导入 TXT ---------- */
async function doImport() {
  const title = $('#importTitle').value.trim();
  const content = $('#importText').value.trim();
  if (!content) { toast('请先选择文件或粘贴内容', 'warn'); return; }
  const btn = $('#btnImportGo');
  btn.disabled = true;
  try {
    const r = await IronAPI.importNovelTxt(title, content);
    closeModal('importModal');
    $('#importTitle').value = ''; $('#importText').value = ''; $('#importFile').value = '';
    load();
    if (confirm(`《${r.summary.title}》导入成功（${r.summary.chapterCount} 章），现在打开编辑？`)) {
      location.href = 'editor.html?id=' + encodeURIComponent(r.id);
    }
  } catch (e) {
    toast(e.message || '导入失败', 'err');
  } finally {
    btn.disabled = false;
  }
}
