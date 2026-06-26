# fnos-easynet

为飞牛OS (fnOS) 量身打造的 Docker 化网络代理解决方案。

## 特性

- **双模式支持**: TUN 透明代理模式 + HTTP/SOCKS5 代理模式，一键切换
- **可视化面板**: 现代化 Web 管理界面，实时监控流量与连接状态
- **mihomo 内核**: 基于 [mihomo](https://github.com/MetaCubeX/mihomo) (Clash Meta)，支持多种主流协议
- **metacubexd 面板**: 集成 [metacubexd](https://github.com/MetaCubeX/metacubexd) 高级配置面板
- **飞牛OS适配**: 针对 fnOS (Debian) 优化，完美兼容 Docker 管理界面
- **订阅管理**: 内置订阅链接管理，支持自动更新节点
- **零配置启动**: 提供默认配置，开箱即用

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/xiaoli0412/fnos-easynet.git
cd fnos-easynet
```

### 2. 配置订阅

编辑 `config/config.yaml`，取消注释 `proxy-providers` 部分并填入你的订阅链接：

```yaml
proxy-providers:
  my-sub:
    type: http
    url: "https://your-subscription-url.com/link"
    interval: 3600
    path: ./providers/my-sub.yaml
    health-check:
      enable: true
      interval: 600
      url: https://www.gstatic.com/generate_204
```

### 3. 启动服务

```bash
docker compose up -d
```

### 4. 访问面板

浏览器打开 `http://飞牛IP:9090` 进入管理面板。

## 飞牛OS 部署指南

### 方式一: SSH 命令行部署

```bash
# SSH 连接飞牛OS
ssh root@你的飞牛IP

# 创建项目目录
mkdir -p /vol1/docker/fnos-easynet
cd /vol1/docker/fnos-easynet

# 克隆仓库
git clone https://github.com/xiaoli0412/fnos-easynet.git .

# 编辑配置
vi config/config.yaml

# 启动
docker compose up -d
```

### 方式二: 飞牛OS Docker 管理界面

1. 打开飞牛OS管理界面 → Docker → Compose
2. 新建项目，名称填写 `fnos-easynet`
3. 上传 `docker-compose.yml` 和 `config/config.yaml`
4. 点击部署

## 端口说明

| 端口 | 协议 | 说明 |
|------|------|------|
| 9090 | HTTP | 管理面板 (Web UI) |
| 7890 | HTTP/SOCKS5 | 混合代理端口 |
| 7891 | SOCKS5 | SOCKS5 代理端口 |
| 9097 | HTTP | mihomo RESTful API |

## 代理模式说明

### 代理模式 (Proxy Mode)

应用层代理模式，通过 HTTP/SOCKS5 端口提供代理服务。需要在应用中手动配置代理地址。

- **HTTP 代理**: `http://飞牛IP:7890`
- **SOCKS5 代理**: `socks5://飞牛IP:7891`

适用于单个应用的代理需求，兼容性最佳。

### TUN 模式 (TUN Mode)

虚拟网卡透明代理模式，创建 `tun0` 虚拟网卡接管系统全部网络流量。

- 无需逐个应用配置，全局生效
- 需要 `NET_ADMIN` 权限
- 适合全局代理需求

> **注意**: TUN 模式需要容器具有 `NET_ADMIN` 权限。docker-compose.yml 已默认配置。

## 旁路由模式

如需将飞牛OS作为旁路由使用，修改 docker-compose.yml：

```yaml
services:
  fnos-easynet:
    network_mode: host  # 使用主机网络模式
    # 注释掉 ports 部分
```

然后在飞牛OS网络设置中将网关指向代理网关地址。

## 项目结构

```
fnos-easynet/
├── Dockerfile              # 多阶段构建
├── docker-compose.yml      # Docker Compose 配置
├── server.js               # Node.js 管理服务器 (零依赖)
├── web/                    # Web 管理面板
│   ├── index.html          # 仪表盘页面
│   ├── css/
│   │   └── style.css       # 样式 (fnOS 暗色主题)
│   └── js/
│       └── app.js          # 前端逻辑
├── config/
│   ├── config.yaml         # mihomo 配置
│   └── supervisord.conf    # 进程管理配置
├── scripts/
│   └── start.sh            # 启动脚本
├── .env.example            # 环境变量示例
├── .gitignore
└── README.md
```

## 技术栈

- **代理内核**: [mihomo](https://github.com/MetaCubeX/mihomo) (Clash Meta)
- **Web 面板**: [metacubexd](https://github.com/MetaCubeX/metacubexd)
- **管理后端**: Node.js (零外部依赖)
- **前端**: 原生 HTML/CSS/JS (fnOS 暗色主题)
- **容器**: Docker + supervisord
- **适配**: 飞牛OS (fnOS) - 基于 Debian

## 构建

```bash
# 本地构建
docker build -t fnos-easynet .

# 运行
docker run -d \
  --name fnos-easynet \
  -p 9090:9090 \
  -p 7890:7890 \
  -p 7891:7891 \
  -p 9097:9097 \
  --cap-add=NET_ADMIN \
  -v ./config:/etc/mihomo \
  -v ./data:/data \
  fnos-easynet
```

## 常见问题

### TUN 模式无法启动

确保容器有正确的权限：
```bash
docker run --cap-add=NET_ADMIN --cap-add=SYS_ADMIN ...
```

### 无法拉取 Docker 镜像

在飞牛OS中先配置好代理，或在 docker-compose.yml 中配置代理环境变量。

### 订阅更新失败

检查订阅链接是否可访问，确认网络连通性。

### 如何查看日志

```bash
docker logs fnos-easynet
# 或进入容器查看
docker exec -it fnos-easynet cat /var/log/supervisor/mihomo.log
```

## License

MIT

## 致谢

- [mihomo](https://github.com/MetaCubeX/mihomo) - 高性能代理内核
- [metacubexd](https://github.com/MetaCubeX/metacubexd) - 优雅的控制面板
- [飞牛OS](https://www.fnnas.com/) - 优秀的国产NAS系统
