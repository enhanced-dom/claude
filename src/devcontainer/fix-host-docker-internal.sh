#!/bin/sh
# In this sandbox, the "--add-host=host.docker.internal:host-gateway" runArg
# resolves to the Docker Desktop VM address (e.g. 192.168.65.254), which
# isn't routable from this container's network namespace. The address that
# actually is routable is the container's own default gateway. Overwrite the
# /etc/hosts entry with that instead, each time the container starts.
#
# /etc/hosts is a bind-mounted file, not a plain file in this container's
# filesystem — `sed -i` (and any edit-by-rename tool) fails with "Device or
# resource busy" trying to rename a new inode over it. Editing its content
# in place (write into the existing inode, no rename) works.
set -e
GATEWAY=$(ip route | awk '/default/ {print $3}')
TMP=$(mktemp)
grep -v 'host.docker.internal' /etc/hosts >"$TMP" || true
echo "$GATEWAY	host.docker.internal" >>"$TMP"
cat "$TMP" >/etc/hosts
rm -f "$TMP"
