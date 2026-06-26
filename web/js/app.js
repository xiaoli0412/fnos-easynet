/**
 * fnos-easynet Dashboard - Core Application Logic
 */

// ─── State Management ────────────────────────────────────────────────────────
const state = {
  mode: 'proxy',
  mihomo: { version: 'loading...' },
  traffic: { up: 0, down: 0 },
  connections: { total: 0, list: [] },
  proxies: { proxies: {}, groups: [] },
  subscriptions: [],
  uptime: 0,
  trafficHistory: [],
  isLoading: true
};

// ─── API Client ──────────────────────────────────────────────────────────────
const api = {
  async get(path) {
    const res = await fetch(`/api${path}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  },

  async post(path, body = {}) {
    const res = await fetch(`/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  },

  async put(path, body = {}) {
    const res = await fetch(`/api${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  },

  async del(path) {
    const res = await fetch(`/api${path}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  }
};

// ─── Utility Functions ───────────────────────────────────────────────────────
function escapeHTML(str) {
  if (typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + units[i];
}

function formatSpeed(bytesPerSec) {
  return formatBytes(bytesPerSec) + '/s';
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}天 ${h}时 ${m}分`;
  if (h > 0) return `${h}时 ${m}分 ${s}秒`;
  return `${m}分 ${s}秒`;
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('zh-CN');
}

// ─── Toast Notification ─────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-hide');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ─── Status Module ───────────────────────────────────────────────────────────
const StatusModule = {
  async refresh() {
    try {
      const data = await api.get('/status');
      state.mode = data.mode;
      state.mihomo = data.mihomo;
      state.traffic = data.traffic;
      state.connections = data.connections;
      state.uptime = data.uptime;
      state.isLoading = false;
      this.render();
    } catch (err) {
      console.error('Status refresh failed:', err);
      state.isLoading = false;
    }
  },

  render() {
    // Mode indicator
    const modeEl = document.getElementById('current-mode');
    if (modeEl) {
      const isTun = state.mode === 'tun';
      modeEl.className = `mode-badge ${isTun ? 'mode-tun' : 'mode-proxy'}`;
      modeEl.textContent = isTun ? 'TUN 模式' : '代理模式';
    }

    // Version
    const versionEl = document.getElementById('mihomo-version');
    if (versionEl) {
      versionEl.textContent = state.mihomo.version || 'unknown';
    }

    // Traffic
    const upEl = document.getElementById('upload-speed');
    const downEl = document.getElementById('download-speed');
    if (upEl) upEl.textContent = formatSpeed(state.traffic.up || 0);
    if (downEl) downEl.textContent = formatSpeed(state.traffic.down || 0);

    // Connections
    const connEl = document.getElementById('active-connections');
    if (connEl) connEl.textContent = state.connections.total || 0;

    // Uptime
    const uptimeEl = document.getElementById('uptime');
    if (uptimeEl) uptimeEl.textContent = formatUptime(state.uptime);

    // Connection list
    this.renderConnections();
  },

  renderConnections() {
    const tbody = document.getElementById('connections-body');
    if (!tbody) return;

    const conns = state.connections.list || [];
    if (conns.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">暂无活跃连接</td></tr>';
      return;
    }

    tbody.innerHTML = conns.slice(0, 15).map(conn => {
      const meta = conn.metadata || {};
      const chains = escapeHTML((conn.chains || []).join(' → ') || '直连');
      return `
        <tr>
          <td>${escapeHTML(meta.host || meta.destinationIP || '-')}</td>
          <td>${escapeHTML(meta.network || '-')}</td>
          <td>${chains}</td>
          <td>${formatBytes(conn.upload || 0)} ↑ / ${formatBytes(conn.download || 0)} ↓</td>
          <td>${escapeHTML(conn.rule || '-')}</td>
        </tr>
      `;
    }).join('');
  }
};

// ─── Mode Module ─────────────────────────────────────────────────────────────
const ModeModule = {
  async switchMode(mode) {
    try {
      showToast(`正在切换到 ${mode === 'tun' ? 'TUN' : '代理'} 模式...`, 'info');
      const result = await api.post('/mode', { mode });
      state.mode = result.mode;
      StatusModule.render();
      this.render();
      showToast(result.message, 'success');
    } catch (err) {
      showToast(`切换失败: ${err.message}`, 'error');
    }
  },

  render() {
    const tunBtn = document.getElementById('btn-tun');
    const proxyBtn = document.getElementById('btn-proxy');
    if (tunBtn) {
      tunBtn.classList.toggle('active', state.mode === 'tun');
    }
    if (proxyBtn) {
      proxyBtn.classList.toggle('active', state.mode === 'proxy');
    }
  }
};

// ─── Proxies Module ──────────────────────────────────────────────────────────
const ProxiesModule = {
  async refresh() {
    try {
      const data = await api.get('/proxies');
      state.proxies = data;
      this.render();
    } catch (err) {
      console.error('Proxies refresh failed:', err);
    }
  },

  async selectProxy(group, name) {
    try {
      await api.put(`/proxies/${encodeURIComponent(group)}`, { name });
      showToast(`已切换 ${group} 到 ${name}`, 'success');
      this.refresh();
    } catch (err) {
      showToast(`切换失败: ${err.message}`, 'error');
    }
  },

  async testDelay(proxyName) {
    try {
      const result = await api.get(`/proxies/${encodeURIComponent(proxyName)}/delay`);
      const delay = result.delay || 0;
      const el = document.getElementById(`delay-${proxyName}`);
      if (el) {
        el.textContent = delay > 0 ? `${delay}ms` : '超时';
        el.className = `delay-badge ${delay > 0 && delay < 200 ? 'delay-good' : delay > 0 && delay < 500 ? 'delay-medium' : 'delay-bad'}`;
      }
    } catch (err) {
      console.error('Delay test failed:', err);
    }
  },

  render() {
    const container = document.getElementById('proxies-list');
    if (!container) return;

    const proxies = state.proxies.proxies || {};
    const groups = Object.entries(proxies).filter(([_, v]) => v.type === 'Selector' || v.type === 'URLTest' || v.type === 'Fallback');

    if (groups.length === 0) {
      container.innerHTML = '<div class="empty-state">暂无代理组，请先配置订阅</div>';
      return;
    }

    container.innerHTML = groups.map(([name, group]) => {
      const allProxies = group.all || [];
      const now = group.now || '';
      const safeName = escapeHTML(name);
      const safeType = escapeHTML(group.type);
      const safeNow = escapeHTML(now);
      return `
        <div class="proxy-group">
          <div class="proxy-group-header">
            <span class="proxy-group-name">${safeName}</span>
            <span class="proxy-group-type">${safeType}</span>
            <span class="proxy-group-current">当前: ${safeNow}</span>
          </div>
          <div class="proxy-group-nodes">
            ${allProxies.map(p => {
              const safeP = escapeHTML(p);
              return `
              <button class="proxy-node ${p === now ? 'active' : ''}"
                      onclick="ProxiesModule.selectProxy('${name.replace(/'/g, "\\'")}', '${p.replace(/'/g, "\\'")}')">
                ${safeP}
                <span id="delay-${safeP}" class="delay-badge">-</span>
              </button>
            `;}).join('')}
          </div>
          <button class="btn btn-sm btn-outline" onclick="ProxiesModule.testAllDelays('${name.replace(/'/g, "\\'")}')">
            测试延迟
          </button>
        </div>
      `;
    }).join('');
  },

  async testAllDelays(groupName) {
    const group = (state.proxies.proxies || {})[groupName];
    if (!group) return;
    const all = group.all || [];
    // Test delays in parallel (up to 20)
    const promises = all.slice(0, 20).map(p => this.testDelay(p));
    await Promise.allSettled(promises);
  }
};

// ─── Subscriptions Module ────────────────────────────────────────────────────
const SubsModule = {
  async refresh() {
    try {
      const data = await api.get('/subscriptions');
      state.subscriptions = data.subscriptions || [];
      this.render();
    } catch (err) {
      console.error('Subscriptions refresh failed:', err);
    }
  },

  async addSubscription(url, name) {
    try {
      await api.post('/subscriptions', { url, name });
      showToast('订阅添加成功', 'success');
      this.refresh();
    } catch (err) {
      showToast(`添加失败: ${err.message}`, 'error');
    }
  },

  async removeSubscription(id) {
    if (!confirm('确定要删除此订阅吗？')) return;
    try {
      await api.del(`/subscriptions/${id}`);
      showToast('订阅已删除', 'success');
      this.refresh();
    } catch (err) {
      showToast(`删除失败: ${err.message}`, 'error');
    }
  },

  render() {
    const container = document.getElementById('subscriptions-list');
    if (!container) return;

    if (state.subscriptions.length === 0) {
      container.innerHTML = '<div class="empty-state">暂无订阅，请添加订阅链接</div>';
      return;
    }

    container.innerHTML = state.subscriptions.map(sub => `
      <div class="sub-item">
        <div class="sub-info">
          <span class="sub-name">${escapeHTML(sub.name)}</span>
          <span class="sub-url" title="${escapeHTML(sub.url)}">${escapeHTML(sub.url.substring(0, 50))}...</span>
          <span class="sub-date">添加于: ${new Date(sub.addedAt).toLocaleDateString('zh-CN')}</span>
        </div>
        <div class="sub-actions">
          <button class="btn btn-sm btn-primary" onclick="SubsModule.updateSubscription('${sub.id}')">更新</button>
          <button class="btn btn-sm btn-danger" onclick="SubsModule.removeSubscription('${sub.id}')">删除</button>
        </div>
      </div>
    `).join('');
  },

  async updateSubscription(id) {
    try {
      showToast('正在更新订阅...', 'info');
      await api.post(`/subscriptions/${id}/update`, {});
      showToast('订阅更新成功', 'success');
      this.refresh();
    } catch (err) {
      showToast(`更新失败: ${err.message}`, 'error');
    }
  }
};

// ─── Traffic Chart ───────────────────────────────────────────────────────────
const ChartModule = {
  canvas: null,
  ctx: null,

  init() {
    this.canvas = document.getElementById('traffic-chart');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },

  resize() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    this.canvas.width = parent.clientWidth;
    this.canvas.height = 200;
    this.draw();
  },

  async refresh() {
    try {
      const data = await api.get('/traffic');
      state.trafficHistory = data.history || [];
      this.draw();
    } catch (err) {
      console.error('Traffic chart refresh failed:', err);
    }
  },

  draw() {
    if (!this.ctx || !this.canvas) return;
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    const padding = 40;

    ctx.clearRect(0, 0, w, h);

    const history = state.trafficHistory;
    if (history.length < 2) {
      ctx.fillStyle = 'var(--text-secondary)';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('等待数据...', w / 2, h / 2);
      return;
    }

    const maxVal = Math.max(...history.map(p => Math.max(p.up, p.down)), 1);
    const graphW = w - padding * 2;
    const graphH = h - padding * 2;
    const stepX = graphW / (history.length - 1);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding + (graphH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(w - padding, y);
      ctx.stroke();

      ctx.fillStyle = 'var(--text-secondary)';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(formatSpeed(maxVal * (1 - i / 4)), padding - 5, y + 3);
    }

    // Download line (green)
    this.drawLine(history, 'down', maxVal, stepX, graphH, '#10b981', padding);
    // Upload line (blue)
    this.drawLine(history, 'up', maxVal, stepX, graphH, '#3b82f6', padding);

    // Legend
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#10b981';
    ctx.fillText('● 下载', w - padding - 80, padding - 15);
    ctx.fillStyle = '#3b82f6';
    ctx.fillText('● 上传', w - padding, padding - 15);
  },

  drawLine(history, key, maxVal, stepX, graphH, color, padding) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';

    history.forEach((point, i) => {
      const x = padding + i * stepX;
      const y = padding + graphH - (point[key] / maxVal) * graphH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Fill area - convert hex color to rgba
    const lastIdx = history.length - 1;
    ctx.lineTo(padding + lastIdx * stepX, padding + graphH);
    ctx.lineTo(padding, padding + graphH);
    ctx.closePath();
    // Parse hex color to rgba with 0.1 alpha
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.1)`;
    ctx.fill();
  }
};

// ─── Navigation ──────────────────────────────────────────────────────────────
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const pages = document.querySelectorAll('.page');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const target = item.dataset.page;

      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      pages.forEach(p => p.classList.remove('active'));
      const targetPage = document.getElementById(`page-${target}`);
      if (targetPage) targetPage.classList.add('active');

      // Refresh data for the target page
      if (target === 'proxies') ProxiesModule.refresh();
      if (target === 'subscriptions') SubsModule.refresh();
    });
  });
}

// ─── Add Subscription Form ───────────────────────────────────────────────────
function initSubForm() {
  const form = document.getElementById('add-sub-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const urlInput = form.querySelector('#sub-url');
    const nameInput = form.querySelector('#sub-name');
    const url = urlInput.value.trim();
    const name = nameInput.value.trim() || '新订阅';

    if (!url) {
      showToast('请输入订阅链接', 'error');
      return;
    }

    await SubsModule.addSubscription(url, name);
    urlInput.value = '';
    nameInput.value = '';
  });
}

// ─── App Init ────────────────────────────────────────────────────────────────
async function initApp() {
  initNavigation();
  initSubForm();
  ChartModule.init();

  // Initial data load
  await StatusModule.refresh();
  ModeModule.render();

  // Auto-refresh with Page Visibility API
  let statusTimer = setInterval(() => StatusModule.refresh(), 3000);
  let chartTimer = setInterval(() => ChartModule.refresh(), 5000);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearInterval(statusTimer);
      clearInterval(chartTimer);
    } else {
      StatusModule.refresh();
      ChartModule.refresh();
      statusTimer = setInterval(() => StatusModule.refresh(), 3000);
      chartTimer = setInterval(() => ChartModule.refresh(), 5000);
    }
  });

  // Hide loading
  const loading = document.getElementById('loading-screen');
  if (loading) {
    loading.classList.add('hidden');
    setTimeout(() => loading.remove(), 500);
  }
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
