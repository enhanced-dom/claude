#!/usr/bin/env bash
# Installs the Node/npm versions declared in the project's package.json
# "engines" field (defaulting to Node 24 / npm 12 latest when unset), via the
# nvm baked into the image at build time. Run by postCreateCommand once the
# project is actually mounted at /workspace — package.json isn't available
# any earlier than that.
set -euo pipefail

# shellcheck source=/dev/null
. "$NVM_DIR/nvm.sh"

NODE_MAJOR=$(jq -r '.engines.node // "24"' package.json | sed -E 's/[^0-9]*([0-9]+).*/\1/')
NPM_MAJOR=$(jq -r '.engines.npm // "12"' package.json | sed -E 's/[^0-9]*([0-9]+).*/\1/')

nvm install "$NODE_MAJOR"
nvm alias default "$NODE_MAJOR"
npm install -g "npm@$NPM_MAJOR"
corepack enable

# nvm's PATH change only lives in this script's shell. Symlink into
# /usr/local/bin so node/npm/npx/corepack are visible to every later command
# in postCreateCommand's "&&" chain, which runs in a fresh shell.
ln -sf "$NVM_DIR/versions/node/$(nvm version default)"/bin/* /usr/local/bin/
