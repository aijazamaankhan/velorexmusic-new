#!/usr/bin/env bash
# scripts/ensure-uploads-symlink.sh
#
# Cron-driven safety net to recreate the public_html/uploads symlink that
# Hostinger's git auto-deploy wipes on every pull.
#
# WHY this exists instead of the PHP self-heal in api/config.php:
# Hostinger's web PHP has `symlink` (along with exec/shell_exec/system) in
# `disable_functions` for security. The PHP self-heal is therefore a silent
# no-op in production — discovered the hard way in May 2026. Cron runs in
# the user shell where `ln -s` is always available, so this works.
#
# HOW TO INSTALL on Hostinger:
#   hPanel → Advanced → Cron Jobs → Add new
#     Schedule: * * * * *   (every minute)
#     Command:  bash /home/u286479481/domains/velorexmusic.com/public_html/scripts/ensure-uploads-symlink.sh
#
# Alternatively (without this script — same behavior in one line):
#   * * * * * [ -L /home/u286479481/domains/velorexmusic.com/public_html/uploads ] || \
#       ln -s /home/u286479481/uploads /home/u286479481/domains/velorexmusic.com/public_html/uploads
#
# IDEMPOTENT — if the symlink exists and is reachable, this script is a no-op.
# Doesn't touch a real directory at the target path (so it won't delete
# uploaded files if the deploy ever creates uploads/ as a regular dir).

set -u

# Allow overrides from env or args for environments other than the standard
# Hostinger layout (e.g. testing locally).
LINK="${UPLOADS_LINK:-${1:-/home/u286479481/domains/velorexmusic.com/public_html/uploads}}"
TARGET="${UPLOADS_TARGET:-${2:-/home/u286479481/uploads}}"

if [ ! -d "$TARGET" ]; then
    # Refuse to create a broken symlink — bail and let an operator look.
    echo "[uploads-symlink] target $TARGET does not exist; refusing to link" >&2
    exit 1
fi

# Already a symlink pointing somewhere reachable → nothing to do.
if [ -L "$LINK" ] && [ -d "$LINK" ]; then
    exit 0
fi

# Real directory at the link path → leave it alone. Don't risk deleting
# user data that some other code path may have written.
if [ -d "$LINK" ] && [ ! -L "$LINK" ]; then
    echo "[uploads-symlink] $LINK exists as a real directory; not replacing" >&2
    exit 0
fi

# Broken symlink (link exists but target doesn't resolve) → remove and recreate.
if [ -L "$LINK" ]; then
    rm -f "$LINK"
fi

ln -s "$TARGET" "$LINK"
echo "[uploads-symlink] created $LINK -> $TARGET"
