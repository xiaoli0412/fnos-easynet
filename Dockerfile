# ─────────────────────────────────────────────────────────
# fnos-easynet - VPN & Proxy for fnOS (飞牛OS)
# Multi-stage build: mihomo core + Node.js management server
# ─────────────────────────────────────────────────────────

# ── Stage 1: Download metacubexd dashboard ──────────────
FROM alpine:3.19 AS ui-builder

RUN apk add --no-cache curl unzip

# Download metacubexd (MetaCubeX Dashboard)
WORKDIR /build
RUN curl -fsSL https://github.com/MetaCubeX/metacubexd/archive/refs/heads/gh-pages.zip \
    -o metacubexd.zip && \
    unzip -q metacubexd.zip -d metacubexd_tmp && \
    mkdir -p /usr/share/metacubexd && \
    cp -r metacubexd_tmp/metacubexd-gh-pages/* /usr/share/metacubexd/

# ── Stage 2: Final image ────────────────────────────────
FROM node:20-alpine

LABEL maintainer="fnos-easynet"
LABEL description="VPN & Proxy solution for fnOS (飞牛OS) - Docker-based with TUN and Proxy modes"
LABEL version="1.0.0"

# Install mihomo and required system tools
RUN apk add --no-cache \
    curl \
    iptables \
    ip6tables \
    iproute2 \
    ca-certificates \
    supervisor \
    && \
    # Install mihomo binary
    ARCH=$(uname -m) && \
    case "$ARCH" in
      x86_64) MIHOMO_ARCH="amd64" ;;
      aarch64) MIHOMO_ARCH="arm64" ;;
      armv7l) MIHOMO_ARCH="armv7" ;;
      *) MIHOMO_ARCH="amd64" ;; \
    esac && \
    MIHOMO_VERSION="v1.18.10" && \
    curl -fsSL "https://github.com/MetaCubeX/mihomo/releases/download/${MIHOMO_VERSION}/mihomo-linux-${MIHOMO_ARCH}-${MIHOMO_VERSION}.gz" \
    -o /tmp/mihomo.gz && \
    gunzip /tmp/mihomo.gz && \
    chmod +x /tmp/mihomo && \
    mv /tmp/mihomo /usr/local/bin/mihomo && \
    # Verify installation
    mihomo -v && \
    # Cleanup
    rm -rf /tmp/* /var/cache/apk/*

# Copy metacubexd dashboard from builder
COPY --from=ui-builder /usr/share/metacubexd /usr/share/metacubexd

# Create directories
RUN mkdir -p /etc/mihomo /data /var/log/supervisor /app

# Copy application files
WORKDIR /app
COPY server.js ./
COPY web/ ./web/
COPY scripts/start.sh /entrypoint.sh
COPY config/supervisord.conf /etc/supervisord.conf

# Make scripts executable
RUN chmod +x /entrypoint.sh

# Create non-root user (supervisord/mihomo need root for TUN)
RUN addgroup -S app && adduser -S app -G app -D -h /nonexistent

# Create default config if not exists
RUN echo "# Default config - will be overridden by mounted config" > /etc/mihomo/.default

# Expose ports
# 9090  - Management Web UI
# 7890  - HTTP/SOCKS5 mixed proxy
# 7891  - SOCKS5 proxy
# 9097  - mihomo RESTful API
EXPOSE 9090 7890 7891 9097

# Health check - check both mihomo and management server
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://127.0.0.1:9097/version && curl -f http://127.0.0.1:9090/api/version || exit 1

# Environment variables
ENV SERVER_PORT=9090 \
    MIHOMO_API=http://127.0.0.1:9097 \
    CONFIG_DIR=/etc/mihomo \
    DATA_DIR=/data

# Entrypoint
ENTRYPOINT ["/entrypoint.sh"]
