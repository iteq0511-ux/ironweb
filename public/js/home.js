/* IronWeb 首页 */
'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  // 填充图标
  document.querySelectorAll('.area-icon .ic')[0].outerHTML = icon('book', 34);
  document.querySelectorAll('.area-icon .ic')[1].outerHTML = icon('film', 34);
  document.querySelectorAll('.area-go .ic')[0].outerHTML = icon('arrowR', 18);
  document.querySelectorAll('.area-go .ic')[1].outerHTML = icon('arrowR', 18);

  const mode = await IronAPI.detect();
  $('#modeText').textContent = mode === 'server' ? '本地服务模式' : '浏览器模式';

  // 运行模式提示
  const badge = $('#modeBadge');
  const badgeText = $('#modeBadgeText');
  if (mode === 'server') {
    badgeText.textContent = '已连接 IronWeb 服务，数据自动保存到电脑 Web 目录';
  } else {
    badgeText.textContent = '浏览器模式（静态托管），数据保存在当前浏览器，可随时导出备份';
  }
  badge.style.display = 'inline-flex';

  // 统计
  try {
    const s = await IronAPI.stats();
    $('#novelMeta').innerHTML = `<span class="pill">${s.novels} 本小说</span>`;
    $('#videoMeta').innerHTML = `<span class="pill">${s.videos} 个视频</span>`;
  } catch { /* 忽略统计失败 */ }
});
