#!/bin/sh
set -e

# ─────────────────────────────────────────────────────────
# fnos-easynet entrypoint script
# Handles TUN device setup and starts supervisord
# ─────────────────────────────────────────────────────────

echo "╔══════════════════════════════════════════╗"
echo "║       fnos-easynet v1.0.0               ║"
echo "║  VPN & Proxy for fnOS (飞牛OS)          ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ─── Ensure config exists ────────────────────────────────
if [ ! -f /etc/mihomo/config.yaml ]; then
  echo "[init] No config.yaml found, creating default config..."
  cat > /etc/mihomo/config.yaml << 'YAML'
# fnos-easynet 默认配置
# 请根据你的需求修改此配置，或通过 Web UI 管理

# ── 基础设置 ──
mixed-port: 7890
socks-port: 7891
port: 7892
allow-lan: true
bind-address: '*'
mode: rule
log-level: info
unified-delay: true
geodata-mode: true
tcp-concurrent: true

# ── 控制面板 ──
external-controller: 0.0.0.0:9097
# external-ui: /usr/share/metacubexd
# secret: ""

# ── 全局 TLS ──
global-client-fingerprint: chrome

# ── DNS 设置 ──
dns:
  enable: true
  listen: 0.0.0.0:1053
  ipv6: false
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  fake-ip-filter:
    - '*.lan'
    - '*.local'
    - 'localhost'
    - '+.stun.*.*'
    - '+.stun.*.*.*'
    - 'dns.msftncsi.com'
    - 'www.msftncsi.com'
    - 'www.msftconnecttest.com'
  default-nameserver:
    - 223.5.5.5
    - 119.29.29.29
  nameserver:
    - 'https://dns.alidns.com/dns-query'
    - 'https://doh.pub/dns-query'
  fallback:
    - 'https://dns.cloudflare.com/dns-query'
    - 'https://dns.google/dns-query'
  fallback-filter:
    geoip: true
    geoip-code: CN
    ipcidr:
      - 240.0.0.0/4

# ── TUN 设置 (通过 Web UI 切换) ──
tun:
  enable: false
  stack: system
  auto-route: true
  auto-detect-interface: true
  dns-hijack:
    - any:53

# ── 代理组 ──
proxy-groups:
  - name: "节点选择"
    type: select
    proxies:
      - 自动选择
      - 故障转移
      - DIRECT

  - name: "自动选择"
    type: url-test
    tolerance: 50
    lazy: true
    url: "https://www.gstatic.com/generate_204"
    interval: 300
    proxies: []

  - name: "故障转移"
    type: fallback
    url: "https://www.gstatic.com/generate_204"
    interval: 300
    tolerance: 50
    proxies: []

# ── 规则 ──
rules:
  # 本地地址直连
  - GEOIP,lan,DIRECT,no-resolve
  - GEOIP,private,DIRECT,no-resolve
  # 国内直连
  - GEOSITE,cn,DIRECT
  - GEOIP,cn,DIRECT
  # 其余走代理
  - MATCH,节点选择
YAML
  echo "[init] Default config created at /etc/mihomo/config.yaml"
fi

# ─── Ensure data directory ───────────────────────────────
mkdir -p /data
if [ ! -f /data/mode.json ]; then
  echo '{"mode":"proxy"}' > /data/mode.json
fi

# ─── Setup TUN device (if available) ────────────────────
echo "[init] Checking TUN device support..."
if [ -e /dev/net/tun ]; then
  echo "[init] TUN device available ✓"
else
  echo "[init] TUN device not found, creating..."
  mkdir -p /dev/net
  mknod /dev/net/tun c 10 200 2>/dev/null || true
  chmod 600 /dev/net/tun 2>/dev/null || true
  if [ -e /dev/net/tun ]; then
    echo "[init] TUN device created ✓"
  else
    echo "[init] WARNING: TUN device not available. TUN mode will not work."
    echo "[init] Make sure to run with --cap-add=NET_ADMIN --device=/dev/net/tun"
  fi
fi

# ─── Setup IP forwarding ────────────────────────────────
echo "[init] Enabling IP forwarding..."
sysctl -w net.ipv4.ip_forward=1 2>/dev/null || true
sysctl -w net.ipv6.conf.all.forwarding=1 2>/dev/null || true

# ─── Setup iptables rules for TUN mode ──────────────────
echo "[init] Configuring network rules..."

# ─── Start supervisord ──────────────────────────────────
echo "[init] Starting services..."
echo ""
echo "  Web UI:     http://0.0.0.0:9090"
echo "  Proxy:      http://0.0.0.0:7890 (HTTP/SOCKS5)"
echo "  SOCKS5:     socks5://0.0.0.0:7891"
echo "  API:        http://0.0.0.0:9097"
echo ""
echo "  Dashboard:  http://0.0.0.0:9090"
echo "  metacubexd: http://0.0.0.0:9090/dashboard/"
echo ""

exec /usr/bin/supervisord -c /etc/supervisord.conf
