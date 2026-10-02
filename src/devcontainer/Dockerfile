FROM debian:trixie-slim

ARG TZ
ENV TZ="$TZ"

ARG CLAUDE_CODE_VERSION=latest
ENV CLAUDE_CODE_VERSION=$CLAUDE_CODE_VERSION

# Install basic development tools and iptables/ipset (ca-certificates/curl/wget
# added since trixie-slim, unlike the node:*-trixie base this used to be, does
# not ship them by default; curl is needed to install nvm below)
RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  wget \
  less \
  git \
  procps \
  sudo \
  fzf \
  zsh \
  man-db \
  unzip \
  gnupg2 \
  gh \
  iptables \
  ipset \
  iproute2 \
  dnsutils \
  aggregate \
  jq \
  nano \
  vim \
  python3 \
  python3-venv \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Create the non-root "node" user (debian:trixie-slim, unlike the node:*
# images this used to be based on, doesn't ship one) — uid/gid 1000 matches
# the official node image's own convention.
RUN groupadd --gid 1000 node && \
  useradd --uid 1000 --gid node --shell /bin/bash --create-home node

# Bake in nvm only — no Node/npm version is installed here. The actual
# Node/npm versions are installed by setup-node.sh (run via postCreateCommand)
# once the target project's package.json is mounted at /workspace, so the
# devcontainer always matches that project's "engines" field rather than
# whatever happened to be baked into a base image tag.
ENV NVM_DIR=/usr/local/nvm
RUN mkdir -p "$NVM_DIR" && \
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh | bash && \
  chown -R node:node "$NVM_DIR"

COPY setup-node.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/setup-node.sh

# node user needs to symlink its nvm-installed node/npm into /usr/local/bin
# (see setup-node.sh) so they're on PATH in every later shell, not just the
# one nvm.sh was sourced in.
RUN chown root:node /usr/local/bin && chmod 775 /usr/local/bin

ARG USERNAME=node

# Persist bash history.
RUN SNIPPET="export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  && mkdir /commandhistory \
  && touch /commandhistory/.bash_history \
  && chown -R $USERNAME /commandhistory

# Set `DEVCONTAINER` environment variable to help with orientation
ENV DEVCONTAINER=true

# Create workspace and config directories and set permissions.
# node_modules paths are pre-created here so Docker seeds any fresh named
# volume mounted at these paths with node:node ownership instead of root.
RUN mkdir -p /workspace/node_modules /home/node/.claude && \
  chown -R node:node /workspace /home/node/.claude

WORKDIR /workspace

ARG GIT_DELTA_VERSION=0.18.2
RUN ARCH=$(dpkg --print-architecture) && \
  wget "https://github.com/dandavison/delta/releases/download/${GIT_DELTA_VERSION}/git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  sudo dpkg -i "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  rm "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb"

# Set up non-root user
USER node

# Set the default shell to zsh rather than sh
ENV SHELL=/bin/zsh

# Set the default editor and visual
ENV EDITOR=nano
ENV VISUAL=nano

# Default powerline10k theme
ARG ZSH_IN_DOCKER_VERSION=1.2.0
RUN sh -c "$(wget -O- https://github.com/deluan/zsh-in-docker/releases/download/v${ZSH_IN_DOCKER_VERSION}/zsh-in-docker.sh)" -- \
  -p git \
  -p fzf \
  -a "source /usr/share/doc/fzf/examples/key-bindings.zsh" \
  -a "source /usr/share/doc/fzf/examples/completion.zsh" \
  -a "export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  -x

# Install rtk (Rust Token Killer) - CLI output compression for reduced token usage
ENV PATH=$PATH:/home/node/.local/bin
RUN curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh


# Copy and set up firewall script
COPY init-firewall.sh /usr/local/bin/
USER root
RUN chmod +x /usr/local/bin/init-firewall.sh && \
  echo "node ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/node-firewall && \
  chmod 0440 /etc/sudoers.d/node-firewall

# Copy and set up host.docker.internal fixup script
COPY fix-host-docker-internal.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/fix-host-docker-internal.sh && \
  echo "node ALL=(root) NOPASSWD: /usr/local/bin/fix-host-docker-internal.sh" > /etc/sudoers.d/node-host-docker-internal && \
  chmod 0440 /etc/sudoers.d/node-host-docker-internal

# Fix ownership of node_modules mount points in case a fresh named volume
# is created there owned by root (Docker default when the mount target
# doesn't already have content at container start).
COPY fix-node-modules-perms.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/fix-node-modules-perms.sh && \
  echo "node ALL=(root) NOPASSWD: /usr/local/bin/fix-node-modules-perms.sh" > /etc/sudoers.d/node-node-modules-perms && \
  chmod 0440 /etc/sudoers.d/node-node-modules-perms
USER node
