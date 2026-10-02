#!/usr/bin/env bash
#
# Sync, back up, and recover the editable-website data folder (SQLite DB +
# content-addressed assets) between your local machine and a deployment.
#
# Deployments are reached through a driver: 'fly' (Fly.io, the default) or
# 'ssh' (any VPS reachable over plain ssh, running the app via docker compose
# or bare node). All provider-specific behavior funnels through five
# primitives — ensure_running, remote, sftp_get, sftp_put, restart_app —
# everything else is identical across providers.
#
# Safety model
#   - The database is copied only as a `VACUUM INTO` snapshot — never a raw file
#     copy, which in WAL mode loses or corrupts data.
#   - Assets are content-addressed and immutable, so they sync additively and
#     are never rolled back; a DB rollback just re-points at the same pool
#     (safe within ASSET_GRACE_PERIOD_DAYS, which is exactly the post-push
#     window an undo is for).
#   - `push` snapshots the current remote DB first (on the volume AND mirrored
#     locally) so it can be undone, validates before and after, and swaps the
#     DB at boot with no live connection open.
#
# Usage
#   ./scripts/data.sh pull                        # remote -> local
#   ./scripts/data.sh push [--yes]                # local  -> remote
#   ./scripts/data.sh restore <name>              # roll remote back to a backup
#   ./scripts/data.sh restore-cloud [--at <ts>]   # roll remote back via the backup bucket (PITR)
#   ./scripts/data.sh pull-cloud [--at <ts>]      # rebuild local data/ from the backup bucket
#   ./scripts/data.sh backups                     # list remote backups
#   ./scripts/data.sh backup                      # take a remote backup only
#   ./scripts/data.sh cloud-snapshots             # list restore points in the backup bucket
#   ./scripts/data.sh verify                      # health-check the deployed database + assets
#   ./scripts/data.sh reset                       # reset local database to fresh demo content
#   ./scripts/data.sh help                        # print the command reference
#
# Fly driver: the target app is read from fly.toml (app = '...'), same as the
# fly CLI. Override with -a <app> or the FLY_APP environment variable (-a wins).
#
# Ssh driver: configured via environment variables or .env (environment wins).
# For a server managed by scripts/vps-deploy.sh, DEPLOY_HOST is the only key
# needed — the rest is discovered from the server. The explicit keys are for
# other setups (bare node, hand-managed compose) and always override:
#   DEPLOY_HOST      user@host to ssh into (setting this selects the driver)
#   RESTART_CMD      how to restart the app, e.g. 'docker restart editable'
#   REMOTE_EXEC      command prefix to enter the app context, e.g.
#                    'docker exec editable' (empty = bare node on the host)
#   REMOTE_APP_DIR   app dir inside the exec context (default /app)
#   REMOTE_DATA_DIR  data dir inside the exec context (default /data)
#   HOST_DATA_DIR    data dir as visible to scp on the host — set when it's a
#                    docker bind mount (default: REMOTE_DATA_DIR)
#   DEPLOY_NAME      label for backups and messages (default: the host)
#   DEPLOY_DRIVER    'fly' or 'ssh' — set explicitly to override the inference
#
set -euo pipefail

DATA_DIR_LOCAL="${DATA_DIR:-data}"
BACKUP_DIR_LOCAL="data-backups"
KEEP_BACKUPS="${KEEP_BACKUPS:-10}"
APP="${FLY_APP:-}"
ASSET_RE='^[a-f0-9]{64}(\.|$)'

# Strip -a <app> from anywhere in the arg list (like fly's own commands).
ARGS=()
while [ $# -gt 0 ]; do
	case "$1" in
		-a)
			[ $# -ge 2 ] || { echo "Error: -a requires an app name" >&2; exit 2; }
			APP="$2"
			shift
			;;
		*) ARGS+=("$1") ;;
	esac
	shift
done
set -- ${ARGS[@]+"${ARGS[@]}"}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Fall back to the app declared in fly.toml (-a and FLY_APP take precedence).
if [ -z "$APP" ] && [ -f "$SCRIPT_DIR/../fly.toml" ]; then
	APP="$(sed -n -E "s/^app[[:space:]]*=[[:space:]]*[\"']?([A-Za-z0-9-]+).*/\1/p" "$SCRIPT_DIR/../fly.toml" | sed -n '1p')"
fi

# ---- deploy driver -----------------------------------------------------------
# Ssh-driver configuration may live in .env — the environment wins over .env.
if [ -f "$SCRIPT_DIR/../.env" ]; then
	while IFS='=' read -r key value; do
		case "$key" in
			DEPLOY_DRIVER | DEPLOY_HOST | DEPLOY_NAME | REMOTE_APP_DIR | REMOTE_DATA_DIR | HOST_DATA_DIR | REMOTE_EXEC | RESTART_CMD)
				# Strip one layer of surrounding quotes.
				value="${value%\"}"; value="${value#\"}"
				value="${value%\'}"; value="${value#\'}"
				eval "current=\${$key:-}"
				[ -n "$current" ] || eval "$key=\$value"
				;;
		esac
	done <"$SCRIPT_DIR/../.env"
fi

DRIVER="${DEPLOY_DRIVER:-}"
if [ -z "$DRIVER" ]; then
	if [ -n "${DEPLOY_HOST:-}" ]; then DRIVER=ssh; else DRIVER=fly; fi
fi
[ "$DRIVER" = "fly" ] || [ "$DRIVER" = "ssh" ] || {
	echo "Error: Unknown DEPLOY_DRIVER '$DRIVER' (expected 'fly' or 'ssh')" >&2
	exit 2
}

DEPLOY_HOST="${DEPLOY_HOST:-}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/app}"
REMOTE_DATA="${REMOTE_DATA_DIR:-/data}"
HOST_DATA_DIR="${HOST_DATA_DIR:-}"
REMOTE_EXEC="${REMOTE_EXEC:-}"

# A vps-deploy.sh-managed server needs only DEPLOY_HOST — the marker file at
# /srv/editable/.deploy_env names the container and host data path, the way
# fly.toml resolves the rest for the fly driver. Explicit values always win,
# and without the marker (bare node, hand-managed compose) nothing changes
# and the explicit keys below stay required.
SSH_CONFIG_DISCOVERED=false
discover_ssh_config() {
	[ "$SSH_CONFIG_DISCOVERED" = false ] || return
	SSH_CONFIG_DISCOVERED=true

	if [ "$DRIVER" = "ssh" ] && [ -n "$DEPLOY_HOST" ] &&
		[ -z "$REMOTE_EXEC" ] && [ -z "${RESTART_CMD:-}" ] && [ -z "$HOST_DATA_DIR" ]; then
		local marker container
		marker="$(ssh "$DEPLOY_HOST" 'cat /srv/editable/.deploy_env 2>/dev/null' 2>/dev/null || true)"
		if [ -n "$marker" ]; then
			container="$(printf '%s\n' "$marker" | sed -n 's/^CONTAINER_NAME=//p')"
			if printf '%s' "$container" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]*$'; then
				REMOTE_EXEC="docker exec $container"
				RESTART_CMD="docker restart $container"
				HOST_DATA_DIR="$(printf '%s\n' "$marker" | sed -n 's/^HOST_DATA_DIR=//p')"
			fi
		fi
	fi

	HOST_DATA_DIR="${HOST_DATA_DIR:-$REMOTE_DATA}"
}

if [ "$DRIVER" = "ssh" ]; then
	APP="${DEPLOY_NAME:-${DEPLOY_HOST#*@}}"
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

die() { echo "Error: $*" >&2; exit 1; }
info() { echo "→ $*"; }

# plural <n> <singular> [<plural>] → "1 entry" / "3 entries"
plural() { [ "$1" -eq 1 ] && echo "$1 $2" || echo "$1 ${3:-${2}s}"; }

need_app() {
	discover_ssh_config
	if [ "$DRIVER" = "ssh" ]; then
		[ -n "${DEPLOY_HOST:-}" ] || die "No deploy host configured — set DEPLOY_HOST='user@host' in .env or the environment"
	else
		[ -n "$APP" ] || die "No app configured — set app = 'my-site' in fly.toml, or pass -a <app>"
	fi
}

confirm() {
	local reply
	printf '%s [y/N] ' "$1"
	read -r reply </dev/tty
	[ "$reply" = "y" ] || [ "$reply" = "Y" ] || die "Aborted."
}

MID=""
ensure_running() {
	if [ "$DRIVER" = "ssh" ]; then
		# A VPS is always on — just confirm it's reachable before starting work.
		ssh -o ConnectTimeout=10 "$DEPLOY_HOST" true >/dev/null 2>&1 ||
			die "Cannot reach '$DEPLOY_HOST' over ssh"
		return
	fi
	# sed (not head) reads all input, avoiding a SIGPIPE that pipefail would trip.
	# flyctl pads the -q output with whitespace, so strip it.
	MID="$(fly machine list -a "$APP" -q | sed -n '1p' | tr -d '[:space:]')"
	[ -n "$MID" ] || die "No machine found for app '$APP'."
	fly machine start "$MID" -a "$APP" >/dev/null 2>&1 || true
}

# Run a remote helper command, retrying while the machine comes back after a
# restart. Prints the first non-empty output; fails only after all attempts —
# a failed ssh connection must never read as a failed check.
remote_retry() {
	local out
	for _ in 1 2 3 4 5 6; do
		out="$(remote "$@" 2>/dev/null || true)"
		if [ -n "$out" ]; then
			printf '%s' "$out"
			return 0
		fi
		sleep 5
	done
	return 1
}

# Verify remote DB health from command *output*, not exit code (fly ssh does
# not reliably propagate the remote exit status).
verify_remote() {
	local ctx="$1" out
	out="$(remote_retry integrity)" ||
		die "Could not reach '$APP' to verify (the machine may still be coming up) — the data operation itself succeeded; verify later with: pnpm data:verify"
	printf '%s' "$out" | grep -qx 'ok' || die "Remote integrity_check failed — $ctx"
	out="$(remote_retry check-assets)" ||
		die "Could not reach '$APP' to verify assets — the data operation itself succeeded; verify later with: pnpm data:verify"
	printf '%s' "$out" | grep -q '^OK:' || die "Remote references missing assets — $ctx"
}

# Run the in-app helper over SSH (pty-less, binary-safe). REMOTE_EXEC enters
# the app context on generic hosts (e.g. 'docker exec editable'); the env
# prefix runs inside that context, so DATA_DIR always names the in-app path.
remote() {
	if [ "$DRIVER" = "ssh" ]; then
		# shellcheck disable=SC2029
		ssh "$DEPLOY_HOST" "${REMOTE_EXEC:+$REMOTE_EXEC }env DATA_DIR='$REMOTE_DATA' sh $REMOTE_APP_DIR/scripts/remote-db.sh $*"
	else
		fly ssh console -a "$APP" --machine "$MID" -C "sh $REMOTE_APP_DIR/scripts/remote-db.sh $*"
	fi
}

# Translate an in-app data path to the path scp sees on the host — they only
# differ when the data dir is a docker bind mount (HOST_DATA_DIR).
host_path() {
	case "$1" in
		"$REMOTE_DATA"/*) printf '%s%s' "$HOST_DATA_DIR" "${1#"$REMOTE_DATA"}" ;;
		*) printf '%s' "$1" ;;
	esac
}

sftp_get() {
	if [ "$DRIVER" = "ssh" ]; then
		scp -q "$DEPLOY_HOST:$(host_path "$1")" "$2"
	else
		fly ssh sftp get -a "$APP" --machine "$MID" "$1" "$2"
	fi
}
sftp_put() {
	if [ "$DRIVER" = "ssh" ]; then
		scp -q "$1" "$DEPLOY_HOST:$(host_path "$2")"
	else
		fly ssh sftp put -a "$APP" --machine "$MID" "$1" "$2"
	fi
}

# Restart the app so the boot-time promote swaps in a staged database.
restart_app() {
	if [ "$DRIVER" = "ssh" ]; then
		[ -n "${RESTART_CMD:-}" ] ||
			die "Set RESTART_CMD (e.g. 'docker restart editable' or 'systemctl restart editable') so the staged database can be swapped in"
		# shellcheck disable=SC2029
		ssh "$DEPLOY_HOST" "$RESTART_CMD"
	else
		fly machine restart "$MID" -a "$APP"
	fi
}

# Backup names double as identifiers, so they must be unique even for two
# operations in the same second (a random suffix, not just seconds). They
# carry the app name so backups of multiple apps can share data-backups/.
# Timestamps are UTC in ISO 8601 basic format (20260712T143535Z) — filename-
# safe, and directly comparable to cloud restore points and fly logs.
timestamp() { printf '%s-%s-%04x' "$APP" "$(date -u +%Y%m%dT%H%M%SZ)" "$RANDOM"; }

# Consistent local DB snapshot to $1; verifies integrity + referenced assets.
snapshot_local_db() {
	local dest="$1"
	[ -f "$DATA_DIR_LOCAL/db.sqlite3" ] || die "No local database at $DATA_DIR_LOCAL/db.sqlite3"
	sqlite3 "$DATA_DIR_LOCAL/db.sqlite3" "VACUUM INTO '$dest'"
	[ "$(sqlite3 "$dest" 'PRAGMA integrity_check')" = "ok" ] || die "Local snapshot failed integrity_check"
	node --disable-warning=ExperimentalWarning "$SCRIPT_DIR/check-assets.js" \
		"$dest" "$DATA_DIR_LOCAL/assets" || die "Local snapshot references missing assets"
}

list_local_assets() {
	ls -1 "$DATA_DIR_LOCAL/assets" 2>/dev/null | grep -E "$ASSET_RE" | sort || true
}

# ---- push: local -> remote -------------------------------------------------
cmd_push() {
	need_app push
	local yes="${1:-}"

	info "Validating local data…"
	snapshot_local_db "$TMP/push.db"

	[ "$yes" = "--yes" ] || confirm "Replace the database on '$APP' with your local one?"

	ensure_running
	mkdir -p "$BACKUP_DIR_LOCAL"
	local ts; ts="$(timestamp)"

	info "Backing up current remote database ($ts)…"
	remote prepare
	# Clear leftovers from any interrupted run — sftp put refuses to overwrite.
	remote clean-incoming
	remote backup "$ts" >/dev/null
	sftp_get "$REMOTE_DATA/backups/$ts.sqlite3" "$BACKUP_DIR_LOCAL/$ts.sqlite3"
	remote prune-backups "$KEEP_BACKUPS"

	info "Syncing assets (additive)…"
	# Push only the snapshot's working set (referenced originals and their
	# variant directories). Unreferenced local history must not be copied to a
	# deployment merely because it is still inside the local grace period.
	node --disable-warning=ExperimentalWarning "$SCRIPT_DIR/check-assets.js" \
		--list-entries "$TMP/push.db" "$DATA_DIR_LOCAL/assets" | sort >"$TMP/local_assets"
	# The listing must provably succeed — a failed connection must not read
	# as an empty asset list (pull would silently miss media). list-assets
	# prints a '#' header, so success is never empty even with zero assets.
	remote_retry list-assets >"$TMP/remote_assets_raw" ||
		die "Could not list remote assets — try again in a moment"
	grep -v '^#' "$TMP/remote_assets_raw" | sort >"$TMP/remote_assets" || true
	comm -23 "$TMP/local_assets" "$TMP/remote_assets" >"$TMP/to_push" || true
	if [ -s "$TMP/to_push" ]; then
		info "  $(plural "$(wc -l <"$TMP/to_push" | tr -d ' ')" 'new asset entry' 'new asset entries')"
		# Keep macOS tar from embedding xattr headers that GNU tar on the server
		# warns about. COPYFILE_DISABLE also prevents AppleDouble sidecars.
		COPYFILE_DISABLE=1 tar --no-xattrs -czf "$TMP/assets.tgz" -C "$DATA_DIR_LOCAL/assets" --exclude '.DS_Store' -T "$TMP/to_push"
		sftp_put "$TMP/assets.tgz" "$REMOTE_DATA/incoming/assets.tgz"
		remote extract-assets
	else
		info "  assets already in sync"
	fi

	info "Staging database…"
	sftp_put "$TMP/push.db" "$REMOTE_DATA/incoming/db.sqlite3.part"
	remote promote-stage

	info "Restarting to swap in the new database…"
	restart_app

	info "Verifying…"
	verify_remote "restore with: pnpm data:restore $ts"

	echo
	echo "✓ Pushed to '$APP'. Undo with:"
	if [ "$DRIVER" = "fly" ]; then
		echo "    pnpm data:restore $ts -a $APP"
	else
		echo "    pnpm data:restore $ts"
	fi
}

# ---- pull: remote -> local -------------------------------------------------
cmd_pull() {
	need_app pull

	if command -v lsof >/dev/null 2>&1 && lsof "$DATA_DIR_LOCAL/db.sqlite3" >/dev/null 2>&1; then
		die "Local database is open — stop the dev server before pulling."
	fi

	ensure_running
	mkdir -p "$BACKUP_DIR_LOCAL" "$DATA_DIR_LOCAL/assets"
	local ts; ts="$(timestamp)"

	info "Snapshotting remote database…"
	remote prepare
	# Clear leftovers from any interrupted run — VACUUM INTO and sftp put both
	# refuse to overwrite existing files.
	remote clean-incoming
	remote snapshot "$REMOTE_DATA/incoming/pull.db"
	sftp_get "$REMOTE_DATA/incoming/pull.db" "$TMP/pull.db"
	[ "$(sqlite3 "$TMP/pull.db" 'PRAGMA integrity_check')" = "ok" ] || die "Downloaded snapshot failed integrity_check"

	info "Syncing assets (additive)…"
	# The listing must provably succeed — a failed connection must not read
	# as an empty asset list (pull would silently miss media). list-assets
	# prints a '#' header, so success is never empty even with zero assets.
	remote_retry list-assets >"$TMP/remote_assets_raw" ||
		die "Could not list remote assets — try again in a moment"
	grep -v '^#' "$TMP/remote_assets_raw" | sort >"$TMP/remote_assets" || true
	list_local_assets >"$TMP/local_assets"
	comm -13 "$TMP/local_assets" "$TMP/remote_assets" >"$TMP/to_pull" || true
	if [ -s "$TMP/to_pull" ]; then
		info "  $(plural "$(wc -l <"$TMP/to_pull" | tr -d ' ')" 'new asset entry' 'new asset entries')"
		sftp_put "$TMP/to_pull" "$REMOTE_DATA/incoming/asset-list"
		remote tar-assets
		sftp_get "$REMOTE_DATA/incoming/assets.tgz" "$TMP/assets.tgz"
		tar -xzf "$TMP/assets.tgz" -C "$DATA_DIR_LOCAL/assets"
	else
		info "  assets already in sync"
	fi
	remote clean-incoming

	# Never install a database whose media isn't actually here.
	info "Validating pulled database against local assets…"
	node --disable-warning=ExperimentalWarning "$SCRIPT_DIR/check-assets.js" \
		"$TMP/pull.db" "$DATA_DIR_LOCAL/assets" ||
		die "Pulled database references assets that are missing locally — nothing was installed"

	if [ -f "$DATA_DIR_LOCAL/db.sqlite3" ]; then
		info "Backing up current local database…"
		sqlite3 "$DATA_DIR_LOCAL/db.sqlite3" "VACUUM INTO '$BACKUP_DIR_LOCAL/local-$ts.sqlite3'"
	fi

	info "Swapping in pulled database…"
	rm -f "$DATA_DIR_LOCAL/db.sqlite3-wal" "$DATA_DIR_LOCAL/db.sqlite3-shm"
	mv "$TMP/pull.db" "$DATA_DIR_LOCAL/db.sqlite3"

	echo
	echo "✓ Pulled from '$APP'."
	if [ -f "$BACKUP_DIR_LOCAL/local-$ts.sqlite3" ]; then
		echo "  Previous local DB: $BACKUP_DIR_LOCAL/local-$ts.sqlite3"
	fi
}

# ---- restore: roll remote back to a backup ---------------------------------
cmd_restore() {
	need_app "restore <name>"
	local name="" yes=""
	for arg in "$@"; do
		case "$arg" in
			--yes) yes="--yes" ;;
			*) name="$arg" ;;
		esac
	done
	[ -n "$name" ] || die "Usage: pnpm data:restore <name> [--yes]   (see: pnpm data:backups)"
	name="${name%.sqlite3}"

	ensure_running
	[ "$yes" = "--yes" ] || confirm "Roll the database on '$APP' back to backup '$name'?"

	mkdir -p "$BACKUP_DIR_LOCAL"
	local ts; ts="$(timestamp)"
	info "Backing up current remote database before restore ($ts)…"
	remote prepare
	# Clear leftovers from any interrupted run — sftp put refuses to overwrite.
	remote clean-incoming
	remote backup "$ts" >/dev/null
	sftp_get "$REMOTE_DATA/backups/$ts.sqlite3" "$BACKUP_DIR_LOCAL/$ts.sqlite3"

	# remote_retry: a transient ssh failure returning an empty listing must
	# not read as "backup not on volume".
	local vol_backups
	vol_backups="$(remote_retry list-backups || true)"
	if printf '%s\n' "$vol_backups" | grep -qx "$name.sqlite3"; then
		info "Staging backup from remote volume…"
		remote stage-backup "$name"
	elif [ -f "$BACKUP_DIR_LOCAL/$name.sqlite3" ]; then
		info "Backup not on volume — staging from local mirror…"
		sftp_put "$BACKUP_DIR_LOCAL/$name.sqlite3" "$REMOTE_DATA/incoming/db.sqlite3.part"
		remote promote-stage
	else
		die "Backup '$name' not found on volume or in $BACKUP_DIR_LOCAL/"
	fi

	info "Restarting to swap in the restored database…"
	restart_app

	info "Verifying…"
	local out
	out="$(remote_retry integrity)" ||
		die "Could not reach '$APP' to verify (the machine may still be coming up) — the restore itself succeeded; verify later with: pnpm data:verify"
	printf '%s' "$out" | grep -qx 'ok' || die "Remote integrity_check failed"
	out="$(remote_retry check-assets)" || out=""
	printf '%s' "$out" | grep -q '^OK:' ||
		echo "Warning: restored DB references assets no longer on disk (past grace period?)"

	echo
	echo "✓ Restored '$APP' to '$name': $(remote summary 2>/dev/null | tr '\n' ' ' | sed 's/ $//')."
	echo "  The pre-restore state is backup '$ts'."
}

# ---- restore-cloud: point-in-time restore from the backup bucket -----------
cmd_restore_cloud() {
	need_app restore-cloud
	local at="" yes=""
	while [ $# -gt 0 ]; do
		case "$1" in
			--yes) yes="--yes" ;;
			--at)
				shift
				at="${1:-}"
				[ -n "$at" ] || die "--at requires an RFC3339 timestamp (e.g. 2026-07-10T15:00:00Z)"
				;;
			*) die "Unknown argument: $1   (usage: pnpm data:restore-cloud [--at <timestamp>] [--yes])" ;;
		esac
		shift
	done

	ensure_running
	[ "$yes" = "--yes" ] || confirm "Roll the database on '$APP' back to ${at:-the latest bucket state}?"

	mkdir -p "$BACKUP_DIR_LOCAL"
	local ts; ts="$(timestamp)"
	info "Backing up current remote database before restore ($ts)…"
	remote prepare
	remote clean-incoming
	remote backup "$ts" >/dev/null
	sftp_get "$REMOTE_DATA/backups/$ts.sqlite3" "$BACKUP_DIR_LOCAL/$ts.sqlite3"

	info "Restoring database from bucket${at:+ (as of $at)}…"
	remote cloud-restore "$at"

	# A point-in-time database may reference assets already purged from the
	# volume (past the grace period) — fetch them from the bucket against the
	# staged database, before promoting, so the swap never goes live with
	# broken media. Success is judged by output: fly ssh does not reliably
	# propagate exit codes.
	info "Restoring referenced assets from bucket…"
	local assets_out
	assets_out="$(remote restore-assets "$REMOTE_DATA/incoming/db.sqlite3.part" 2>&1 || true)"
	printf '%s\n' "$assets_out"
	printf '%s' "$assets_out" | grep -q '^\[backup\] Restored state:' ||
		die "Could not restore the referenced assets — aborting before the database swap"

	remote promote-stage

	info "Restarting to swap in the restored database…"
	restart_app

	info "Verifying…"
	verify_remote "roll back with: pnpm data:restore $ts"

	echo
	echo "✓ Restored '$APP' from the bucket${at:+ (as of $at)}: $(remote summary 2>/dev/null | tr '\n' ' ' | sed 's/ $//')."
	echo "  The pre-restore state is backup '$ts'."
}

# ---- pull-cloud: rebuild the local data/ folder from the backup bucket -----
cmd_pull_cloud() {
	local at=""
	while [ $# -gt 0 ]; do
		case "$1" in
			--at)
				shift
				at="${1:-}"
				[ -n "$at" ] || die "--at requires an RFC3339 timestamp (e.g. 2026-07-12T13:00:00Z)"
				;;
			*) die "Unknown argument: $1   (usage: pnpm data:pull-cloud [--at <timestamp>])" ;;
		esac
		shift
	done

	# Prefer the project-local, version-pinned binary (pnpm litestream:install).
	PATH="$SCRIPT_DIR/../node_modules/.bin:$PATH"
	command -v litestream >/dev/null 2>&1 ||
		die "litestream is not installed — run: pnpm litestream:install"

	# Bucket credentials from the environment, falling back to .env.
	if [ -z "${BUCKET_NAME:-}" ] && [ -f .env ]; then
		set -a
		# shellcheck disable=SC1091
		. ./.env
		set +a
	fi
	[ -n "${BUCKET_NAME:-}" ] || die "Set BUCKET_NAME (and the AWS_* credentials) in .env or the environment"

	if command -v lsof >/dev/null 2>&1 && lsof "$DATA_DIR_LOCAL/db.sqlite3" >/dev/null 2>&1; then
		die "Local database is open — stop the dev server before pulling."
	fi

	mkdir -p "$BACKUP_DIR_LOCAL" "$DATA_DIR_LOCAL/assets"
	local ts; ts="$(date -u +%Y%m%dT%H%M%SZ)"

	info "Restoring database from bucket${at:+ (as of $at)}…"
	export DATA_DIR="$DATA_DIR_LOCAL"
	if [ -n "$at" ]; then
		litestream restore -config "$SCRIPT_DIR/litestream.yml" -timestamp "$at" -o "$TMP/cloud.db" "$DATA_DIR_LOCAL/db.sqlite3"
	else
		litestream restore -config "$SCRIPT_DIR/litestream.yml" -o "$TMP/cloud.db" "$DATA_DIR_LOCAL/db.sqlite3"
	fi
	[ "$(sqlite3 "$TMP/cloud.db" 'PRAGMA integrity_check')" = "ok" ] || die "Restored snapshot failed integrity_check"

	# Assets first, against the not-yet-installed database: if a referenced
	# asset can't be produced, nothing is installed and local data/ is untouched.
	info "Downloading referenced assets…"
	node --disable-warning=ExperimentalWarning "$SCRIPT_DIR/restore-assets.js" "$TMP/cloud.db" ||
		die "Could not restore all referenced assets — nothing was installed"

	if [ -f "$DATA_DIR_LOCAL/db.sqlite3" ]; then
		info "Backing up current local database…"
		sqlite3 "$DATA_DIR_LOCAL/db.sqlite3" "VACUUM INTO '$BACKUP_DIR_LOCAL/local-$ts.sqlite3'"
	fi

	info "Swapping in restored database…"
	rm -f "$DATA_DIR_LOCAL/db.sqlite3-wal" "$DATA_DIR_LOCAL/db.sqlite3-shm"
	mv "$TMP/cloud.db" "$DATA_DIR_LOCAL/db.sqlite3"

	echo
	echo "✓ Restored local data/ from the bucket."
}

# ---- reset: reset the local database to fresh demo content -----------------
cmd_reset() {
	local yes="${1:-}"

	if command -v lsof >/dev/null 2>&1 && lsof "$DATA_DIR_LOCAL/db.sqlite3" >/dev/null 2>&1; then
		die "Local database is open — stop the dev server before resetting."
	fi

	[ "$yes" = "--yes" ] || confirm "Reset your local database to fresh demo content? (assets stay in place)"

	local ts; ts="$(date -u +%Y%m%dT%H%M%SZ)"
	if [ -f "$DATA_DIR_LOCAL/db.sqlite3" ]; then
		info "Backing up current local database…"
		mkdir -p "$BACKUP_DIR_LOCAL"
		sqlite3 "$DATA_DIR_LOCAL/db.sqlite3" "VACUUM INTO '$BACKUP_DIR_LOCAL/local-$ts.sqlite3'"
	fi

	# Only the database is reset. Assets stay in place: the pool is
	# content-addressed, and files the fresh database doesn't reference are
	# cleaned up by the grace-period sweep.
	rm -f "$DATA_DIR_LOCAL/db.sqlite3" "$DATA_DIR_LOCAL/db.sqlite3-wal" "$DATA_DIR_LOCAL/db.sqlite3-shm"

	echo
	echo "✓ Local database cleared. Start the dev server (pnpm dev) to get a freshly seeded site."
	if [ -f "$BACKUP_DIR_LOCAL/local-$ts.sqlite3" ]; then
		echo "  Previous database: $BACKUP_DIR_LOCAL/local-$ts.sqlite3"
	fi
}

cmd_backup() {
	need_app backup
	ensure_running
	mkdir -p "$BACKUP_DIR_LOCAL"
	local ts; ts="$(timestamp)"
	remote prepare
	remote backup "$ts" >/dev/null
	sftp_get "$REMOTE_DATA/backups/$ts.sqlite3" "$BACKUP_DIR_LOCAL/$ts.sqlite3"
	remote prune-backups "$KEEP_BACKUPS"
	echo "✓ Backup '$ts' (remote volume + $BACKUP_DIR_LOCAL/$ts.sqlite3)"
}

cmd_translations() {
	if [ "$#" -eq 1 ] && [ "$1" = "--local" ]; then
		[ -f "$DATA_DIR_LOCAL/db.sqlite3" ] || die "No local database at $DATA_DIR_LOCAL/db.sqlite3"
		info "Local translations ($DATA_DIR_LOCAL/db.sqlite3)"
		node --disable-warning=ExperimentalWarning "$SCRIPT_DIR/translations.js" "$DATA_DIR_LOCAL/db.sqlite3" list
		return
	fi
	[ "$#" -eq 0 ] || die "Usage: pnpm data:translations [--local]"
	need_app translations
	ensure_running
	info "Live translations on '$APP'"
	remote translations
}

cmd_purge_translations() {
	local language="" yes="" local_mode=false out arg backup_path
	for arg in "$@"; do
		case "$arg" in
			--local) local_mode=true ;;
			--yes) yes=--yes ;;
			*) [ -z "$language" ] || die "Specify only one language"; language="$arg" ;;
		esac
	done
	[[ "$language" =~ ^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$ ]] ||
		die "Usage: pnpm data:purge-translations <language> [--local] [--yes]"
	if [ "$local_mode" = true ]; then
		cmd_translations --local
		[ "$yes" = "--yes" ] || confirm "Permanently delete all '$language' translations in your local database ($DATA_DIR_LOCAL/db.sqlite3)?"
		mkdir -p "$BACKUP_DIR_LOCAL"
		backup_path="$BACKUP_DIR_LOCAL/local-$(date -u +%Y%m%dT%H%M%SZ)-$(printf '%04x' "$RANDOM").sqlite3"
		sqlite3 -cmd '.timeout 10000' "$DATA_DIR_LOCAL/db.sqlite3" "VACUUM INTO '$backup_path'"
		info "Local backup: $backup_path"
		node --disable-warning=ExperimentalWarning "$SCRIPT_DIR/translations.js" "$DATA_DIR_LOCAL/db.sqlite3" purge "$language" --yes
		return
	fi
	need_app purge-translations
	ensure_running
	info "Live translations on '$APP'"
	remote translations
	[ "$yes" = "--yes" ] || confirm "Permanently delete all '$language' translations on '$APP'?"
	cmd_backup
	out="$(remote purge-translations "$language" 2>&1)" || die "$out"
	printf '%s\n' "$out"
	[[ "$out" == *"OK: purged $language translations"* ]] || die "Purge was not confirmed by the server; inspect its output before retrying."
}

cmd_backups() {
	need_app backups
	ensure_running
	echo "Remote backups on '$APP':"
	remote list-backups
}

# ---- verify: health-check the deployment ------------------------------------
cmd_verify() {
	need_app verify
	ensure_running
	info "Verifying '$APP'…"
	verify_remote "list restore points with: pnpm data:backups"
	echo "✓ '$APP' is healthy: $(remote summary 2>/dev/null | tr '\n' ' ' | sed 's/ $//')."
}

cmd_cloud_snapshots() {
	need_app cloud-snapshots
	ensure_running
	echo "Restore points for '$APP', oldest first — restore one with restore-cloud/pull-cloud --at <timestamp>."
	echo "Older points get consolidated over time: recent history is fine-grained, old history coarser."
	remote cloud-snapshots
}

usage() {
	cat <<'EOF'
Data commands (via pnpm; arguments are forwarded directly):

  pnpm data:pull                            copy the live site's data to your machine
  pnpm data:push [--yes]                    replace the live site's data with your local state
  pnpm data:backup                          snapshot the live database
  pnpm data:backups                         list the live site's snapshots
  pnpm data:restore <name> [--yes]          roll the live site back to a snapshot
  pnpm data:cloud-snapshots                 list restore points in the backup bucket
  pnpm data:restore-cloud [--at <ts>]       roll the live site back to a point in time
  pnpm data:pull-cloud [--at <ts>]          rebuild local data/ from the backup bucket
  pnpm data:translations [--local]          list stored languages (live by default)
  pnpm data:purge-translations <lang> [--local] [--yes]
                                           back up, then purge a language without restarting
  pnpm data:verify                          health-check the deployed database + assets
  pnpm data:reset [--yes]                   reset local database to fresh demo content (assets stay)
  pnpm litestream:install                   one-time local setup for the cloud commands

The target comes from fly.toml (Fly.io, override with: -a <app>) or from
DEPLOY_HOST in .env (any VPS over plain ssh — see README → Deploy to a VPS).
Snapshot names (<name>) look like my-site-20260712T143535Z-3f2a (file extension optional) — list them with data:backups.
Timestamps (<ts>) are RFC3339 UTC, e.g. 2026-07-12T14:35:35Z — list them with data:cloud-snapshots.
See README → Backup, sync & recovery for details.
EOF
}

case "${1:-}" in
	push) shift; cmd_push "${1:-}" ;;
	pull) cmd_pull ;;
	restore) shift; cmd_restore "$@" ;;
	restore-cloud) shift; cmd_restore_cloud "$@" ;;
	pull-cloud) shift; cmd_pull_cloud "$@" ;;
	backup) cmd_backup ;;
	backups) cmd_backups ;;
	translations) shift; cmd_translations "$@" ;;
	purge-translations) shift; cmd_purge_translations "$@" ;;
	cloud-snapshots) cmd_cloud_snapshots ;;
	verify) cmd_verify ;;
	reset) shift; cmd_reset "${1:-}" ;;
	help) usage ;;
	*) usage >&2; exit 2 ;;
esac
