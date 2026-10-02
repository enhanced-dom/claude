#!/bin/sh
# Ensures node_modules/.venv volume mount points are owned by the node user.
# Docker creates a fresh named volume as root:root when the mount target
# has no existing content, which breaks npm install / venv creation as a
# non-root user. Runs post-mount (postCreateCommand), so the workspace's
# real layout is already on disk and every node_modules dir can be
# discovered here instead of hardcoding project-specific subfolder paths.
set -e
find /workspace -type d -name node_modules -prune -exec mkdir -p {} \; -exec chown node:node {} \;
[ -d /workspace/.venv ] && chown node:node /workspace/.venv || true
