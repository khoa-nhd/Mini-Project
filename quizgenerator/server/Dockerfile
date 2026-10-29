# Quiz Generator: web + API + Blooket publisher in one container.
# Build from the quizgenerator/ directory:  docker compose build app
#
# The browser runs headful inside a virtual display (Xvfb), so nothing appears on
# anyone's screen; /admin shows that display through noVNC when a human needs to
# log in to Blooket again.

ARG PLAYWRIGHT_IMAGE=mcr.microsoft.com/playwright:v1.64.1-noble

# ---------- build: install everything, compile shared → server → web ----------
FROM ${PLAYWRIGHT_IMAGE} AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm ci

COPY tsconfig.json ./
COPY packages/shared ./packages/shared
COPY server ./server
COPY web ./web

# Public Turnstile site key, baked into the web bundle (not a secret).
ARG VITE_TURNSTILE_SITE_KEY=""
ENV VITE_TURNSTILE_SITE_KEY=${VITE_TURNSTILE_SITE_KEY}

RUN npm run build --workspace=@quizgenerator/shared \
 && npm run build --workspace=@quizgenerator/server \
 && npm run build --workspace=@quizgenerator/web \
 && npm prune --omit=dev

# ---------- runtime ----------
FROM ${PLAYWRIGHT_IMAGE}

# Virtual display + VNC server + noVNC web client, run by supervisord.
RUN apt-get update \
 && apt-get install -y --no-install-recommends xvfb x11vnc novnc websockify supervisor \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix \
 && mkdir -p /data/profile /data/state /data/tmp && chown -R pwuser:pwuser /data

WORKDIR /app
COPY --from=build --chown=pwuser:pwuser /app/package.json ./
COPY --from=build --chown=pwuser:pwuser /app/node_modules ./node_modules
COPY --from=build --chown=pwuser:pwuser /app/packages/shared/package.json ./packages/shared/
COPY --from=build --chown=pwuser:pwuser /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=pwuser:pwuser /app/server/package.json ./server/
COPY --from=build --chown=pwuser:pwuser /app/server/dist ./server/dist
COPY --from=build --chown=pwuser:pwuser /app/web/dist ./web/dist
COPY server/docker/supervisord.conf /etc/supervisor/quizgenerator.conf

ENV NODE_ENV=production \
    PORT=8080 \
    DISPLAY=:99 \
    PLAYWRIGHT_HEADLESS=false \
    BLOOKET_PROFILE_DIR=/data/profile \
    STATE_DIR=/data/state \
    BLOOKET_TMP_DIR=/data/tmp \
    WEB_DIST_DIR=/app/web/dist \
    VNC_UPSTREAM=http://127.0.0.1:6080

# Login profile, session state and job log survive container rebuilds.
VOLUME ["/data"]
EXPOSE 8080
USER pwuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["supervisord", "-n", "-c", "/etc/supervisor/quizgenerator.conf"]
