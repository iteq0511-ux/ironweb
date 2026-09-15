/* IronWeb 视频区页面 */
'use strict';

let videoList = [];
const urlCache = {}; // id -> objectURL（local 模式，用于回收）

document.addEventListener('DOMContentLoaded', async () => {
  bindModalClose();
  $('#btnBack').innerHTML = icon('back', 20);
  $('#btnRefresh').innerHTML = icon('refresh', 18);
  $('#btnAddLink').innerHTML = icon('link', 17) + '添加链接';
  $('#btnImport').innerHTML = icon('upload', 17) + '导入视频';
  $('#btnImportGo').innerHTML = icon('upload', 17) + '开始导入';
  $('#btnLinkGo').innerHTML = icon('plus', 17) + '添加';
  $('#playerClose').innerHTML = icon('x', 20);
  document.querySelectorAll('[data-icon="search"]')[0].outerHTML = icon('search', 16);
  document.querySelectorAll('[data-icon="film"]')[0].outerHTML = icon('film', 54);
  document.querySelectorAll('.modal-head .icon-btn').forEach(b => b.innerHTML = icon('x', 18));

  await IronAPI.detect();
  const serverMode = IronAPI.getMode() === 'server';
  $('#modeText').textContent = serverMode ? '本地服务模式' : '浏览器模式';
  $('#importModeNote').textContent = serverMode
    ? '视频将上传保存到 IronWeb 服务端数据目录（本地电脑 Web 目录）。'
    : '浏览器模式：视频将保存在当前浏览器存储中，请勿清理浏览器数据以免丢失。';

  $('#btnBack').addEventListener('click', () => location.href = 'index.html');
  $('#btnRefresh').addEventListener('click', load);
  $('#btnImport').addEventListener('click', () => openModal('importModal'));
  $('#btnAddLink').addEventListener('click', () => openModal('linkModal'));
  $('#searchInput').addEventListener('input', render);
  $('#btnImportGo').addEventListener('click', doImport);
  $('#btnLinkGo').addEventListener('click', doAddLink);
  $('#playerClose').addEventListener('click', closePlayer);
  $('#player').addEventListener('click', e => { if (e.target === $('#player')) closePlayer(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePlayer(); });
  $('#importFile').addEventListener('change', () => {
    const f = $('#importFile').files[0];
    if (f) $('#importModeNote').textContent = `已选择：${f.name}（${fmtSize(f.size)}）`;
  });

  await load();
});

async function load() {
  videoList = await IronAPI.listVideos();
  render();
}

function render() {
  const kw = $('#searchInput').value.trim().toLowerCase();
  const list = kw ? videoList.filter(v => (v.title + ' ' + (v.fileName || '')).toLowerCase().includes(kw)) : videoList;
  const grid = $('#videoGrid');
  grid.innerHTML = '';
  $('#videoCount').textContent = `${videoList.length} 个`;
  $('#emptyBox').style.display = list.length ? 'none' : 'block';
  if (kw && !list.length) {
    $('#emptyBox').style.display = 'block';
    $('#emptyBox').querySelector('h3').textContent = '没有找到匹配的视频';
    $('#emptyBox').querySelector('p').textContent = '换个关键词试试';
  }

  list.forEach(v => {
    const card = document.createElement('div');
    card.className = 'v-card';
    const isLink = !!v.isLink;
    card.innerHTML = `
      <div class="v-thumb" data-play>
        <span class="thumb-fallback ic">${icon('film', 46)}</span>
        <video muted preload="metadata" playsinline ${isLink ? 'src="' + esc(v.url) + '"' : ''}></video>
        <span class="play-mask">${icon('play', 52)}</span>
      </div>
      <div class="card-body">
        <div class="card-title" title="${esc(v.title)}">${esc(v.title)}</div>
        <span class="src-tag ${isLink ? 'link' : 'local'}">${isLink ? '在线链接' : '本地文件'}</span>
        <div class="card-meta">
          <span>${isLink ? '—' : fmtSize(v.size)}</span><span>${fmtTime(v.createdAt)}</span>
        </div>
        <div class="card-actions">
          <button class="btn primary sm" data-act="play">播放</button>
          <button class="btn sm" data-act="export">导出</button>
          <button class="btn danger sm" data-act="del">删除</button>
        </div>
      </div>`;

    const thumb = card.querySelector('.v-thumb');
    if (!isLink) {
      IronAPI.videoFileUrl(v.id).then(u => {
        if (u) { const vid = thumb.querySelector('video'); vid.src = u; urlCache[v.id] = u; }
      });
    }
    thumb.addEventListener('click', () => playVideo(v));
    card.querySelector('[data-act="play"]').addEventListener('click', () => playVideo(v));
    card.querySelector('[data-act="export"]').addEventListener('click', async () => exportVideo(v));
    card.querySelector('[data-act="del"]').addEventListener('click', async () => {
      if (!confirm(`删除视频「${v.title}」？`)) return;
      await IronAPI.deleteVideo(v.id);
      if (urlCache[v.id]) { URL.revokeObjectURL(urlCache[v.id]); delete urlCache[v.id]; }
      toast('已删除', 'ok');
      load();
    });
    grid.appendChild(card);
  });
}

/* ---------- 播放 ---------- */
async function playVideo(v) {
  $('#player').classList.add('open');
  document.body.classList.add('locked');
  const video = $('#playerVideo');
  if (v.isLink) {
    video.src = v.url;
  } else {
    const u = urlCache[v.id] || await IronAPI.videoFileUrl(v.id);
    if (!u) { toast('视频文件不可用', 'err'); closePlayer(); return; }
    urlCache[v.id] = u;
    video.src = u;
  }
  video.play().catch(() => { /* 等待用户操作 */ });
}

function closePlayer() {
  const video = $('#playerVideo');
  video.pause();
  video.removeAttribute('src');
  video.load();
  $('#player').classList.remove('open');
  document.body.classList.remove('locked');
}

/* ---------- 导出 ---------- */
async function exportVideo(v) {
  if (v.isLink) {
    if (confirm('这是在线链接视频，是否在新窗口打开原链接？')) window.open(v.url, '_blank');
    return;
  }
  const name = v.fileName || v.title || 'video';
  if (IronAPI.getMode() === 'server') {
    const a = document.createElement('a');
    a.href = 'api/videos/' + encodeURIComponent(v.id) + '/download';
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } else {
    const u = urlCache[v.id] || await IronAPI.videoDownloadUrl(v.id);
    if (!u) { toast('视频文件不可用', 'err'); return; }
    const a = document.createElement('a');
    a.href = u;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  toast('开始导出', 'ok');
}

/* ---------- 导入 ---------- */
async function doImport() {
  const file = $('#importFile').files[0];
  if (!file) { toast('请先选择视频文件', 'warn'); return; }
  const btn = $('#btnImportGo');
  btn.disabled = true;
  const bar = $('#uploadProgress');
  bar.classList.add('show');
  bar.querySelector('div').style.width = '0%';
  const { promise, abort } = IronAPI.importVideo(file, p => {
    bar.querySelector('div').style.width = Math.round(p * 100) + '%';
  });
  try {
    const v = await promise;
    bar.querySelector('div').style.width = '100%';
    toast('导入成功', 'ok');
    closeModal('importModal');
    $('#importFile').value = '';
    setTimeout(() => bar.classList.remove('show'), 800);
    load();
  } catch (e) {
    toast(e.message || '导入失败', 'err');
  } finally {
    btn.disabled = false;
  }
}

/* ---------- 添加链接 ---------- */
async function doAddLink() {
  const url = $('#linkUrl').value.trim();
  const title = $('#linkTitle').value.trim();
  if (!url) { toast('请输入视频地址', 'warn'); return; }
  if (!/^https?:\/\//i.test(url)) { toast('请输入 http(s) 开头的有效链接', 'warn'); return; }
  try {
    await IronAPI.addVideoLink(title || url.split('/').pop() || '视频链接', url);
    toast('链接已添加', 'ok');
    closeModal('linkModal');
    $('#linkUrl').value = ''; $('#linkTitle').value = '';
    load();
  } catch (e) {
    toast(e.message || '添加失败', 'err');
  }
}
