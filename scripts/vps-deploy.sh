#!/usr/bin/env bash
#
# Deploy an Editable site to a VPS — see VPS_DEPLOY_SPEC.md for the design.
#
# One command takes a fresh Ubuntu server (amd64, ssh key access) to a running,
# TLS-terminated site; the same command run again ships a code update. The
# image is built locally and streamed over ssh — the server never needs git
# access, pnpm, or the memory to run a build. The only state that matters on
# the server is the bind-mounted data directory /data (the same path Fly.io
# mounts); the container is disposable and replaced on every deploy.
#
# Usage
#   ./scripts/vps-deploy.sh <user@host> <domain>   first deploy (or explicit target)
#   ./scripts/vps-deploy.sh                        deploy to DEPLOY_HOST
#   ./scripts/vps-deploy.sh status                 show the running tag and rollback candidates
#   ./scripts/vps-deploy.sh logs                   follow the app's container logs
#   ./scripts/vps-deploy.sh env                    show the server's env (secrets masked)
#   ./scripts/vps-deploy.sh env set KEY=VALUE …    set env vars and restart the app
#   ./scripts/vps-deploy.sh env set KEY            prompt for the value (hidden input)
#   ./scripts/vps-deploy.sh env unset KEY …        remove env vars and restart the app
#
# The short forms read DEPLOY_HOST from your local .env — the deployment
# block printed after the first deploy, added by hand so it's transparent
# where the target comes from — and discover the site on the server. The
# explicit form works before that block exists and always overrides it:
#   ./scripts/vps-deploy.sh root@203.0.113.10 my-site.example.com [env …]
#
# Options
#   --tag <tag>   deploy an already-uploaded image tag (rollback) instead of
#                 building — the last 3 tags are kept on the server
#   --yes         skip confirmation prompts (except the first-run password)
#   --tail <n>    logs: lines of history to show first (default 100)
#   --no-follow   logs: print and exit instead of following
#
# Every deploy runs the same idempotent phases — preflight, provision,
# configure, build & upload, activate, verify, cleanup. The first run does
# everything; later runs fall through to the deploy phases in seconds.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

die() { echo "Error: $*" >&2; exit 1; }
info() { echo "→ $*"; }
warn() { echo "Warning: $*" >&2; }

confirm() {
	[ "$YES" = true ] && return 0
	local reply
	printf '%s [y/N] ' "$1"
	read -r reply </dev/tty
	[ "$reply" = "y" ] || [ "$reply" = "Y" ] || die "Aborted."
}

# ---- arguments ---------------------------------------------------------------

TAG=""
YES=false
FOLLOW=true
LOG_TAIL=100
POSITIONAL=()

usage() { awk 'NR < 3 { next } /^set -euo pipefail/ { exit } { sub(/^# ?/, ""); print }' "${BASH_SOURCE[0]}"; }

# Read a value from the local .env (first uncommented occurrence).
local_env_val() {
	[ -f .env ] || return 0
	sed -n -E "s/^$1=[\"']?([^\"']*)[\"']?[[:space:]]*$/\1/p" .env | sed -n '1p'
}

while [ $# -gt 0 ]; do
	case "$1" in
		--tag)
			[ $# -ge 2 ] || die "--tag requires a value"
			TAG="$2"
			shift
			;;
		--yes) YES=true ;;
		--no-follow) FOLLOW=false ;;
		--tail)
			[ $# -ge 2 ] || die "--tail requires a value"
			echo "$2" | grep -Eq '^[0-9]+$' || die "--tail needs a number of lines"
			LOG_TAIL="$2"
			shift
			;;
		-h | --help) usage; exit 0 ;;
		-*) die "Unknown option '$1' (see --help)" ;;
		*) POSITIONAL+=("$1") ;;
	esac
	shift
done

case "${POSITIONAL[0]:-}" in
	*@*)
		# Explicit form: <user@host> <domain> [env …]
		TARGET="${POSITIONAL[0]}"
		DOMAIN="${POSITIONAL[1]:-}"
		[ -n "$DOMAIN" ] || die "the explicit form needs a domain: vps-deploy.sh $TARGET <domain>"
		ACTION="${POSITIONAL[2]:-deploy}"
		ENV_ARGS=("${POSITIONAL[@]:3}")
		case "$ACTION" in
			deploy | env | status | logs) ;;
			*) die "Unknown command '$ACTION' (see --help)" ;;
		esac
		;;
	"" | env | status | logs)
		# Short form: the target comes from DEPLOY_HOST (environment wins over
		# .env), the site and its domain are discovered on the server.
		ACTION="${POSITIONAL[0]:-deploy}"
		ENV_ARGS=("${POSITIONAL[@]:1}")
		TARGET="${DEPLOY_HOST:-$(local_env_val DEPLOY_HOST)}"
		[ -n "$TARGET" ] || die "DEPLOY_HOST is not set — add the deployment block to .env (printed after the first deploy), or pass an explicit target: vps-deploy.sh user@host domain"
		case "$TARGET" in
			*@*) ;;
			*) die "DEPLOY_HOST must be user@host, e.g. root@203.0.113.10" ;;
		esac
		DOMAIN="" # discovered on the server
		;;
	*) die "Unknown command '${POSITIONAL[0]}' (see --help)" ;;
esac

# Values interpolated into remote commands are validated to safe character
# sets first — everything else reaches the remote side via stdin only.
validate_domain() {
	DOMAIN="$(echo "$DOMAIN" | tr '[:upper:]' '[:lower:]')"
	echo "$DOMAIN" | grep -Eq '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' ||
		die "'$DOMAIN' does not look like a domain name"
}
[ -z "$DOMAIN" ] || validate_domain

# One site per server, so nothing needs a per-site name: runtime files live
# in /srv/editable, the data in /data (the same path Fly.io mounts and the
# same path inside the container), and the container is plain 'editable' —
# identical to a hand-managed compose setup.
SRV="/srv/editable"
CONTAINER="editable"

if [ -n "$TAG" ]; then
	echo "$TAG" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]*$' || die "'$TAG' is not a valid image tag"
fi

REMOTE_USER="${TARGET%%@*}"
HOST_ADDR="${TARGET#*@}"

SUDO=""
[ "$REMOTE_USER" = "root" ] || SUDO="sudo"

TMP="$(mktemp -d)"
# Close the multiplexing master connection, then remove the temp dir.
trap 'ssh -o ControlPath="$TMP/ssh" -O exit "$TARGET" 2>/dev/null || true; rm -rf "$TMP"' EXIT

# accept-new: trust a fresh server's host key on first contact (a brand-new
# droplet is never in known_hosts), but still fail hard if a known key changes.
#
# ControlMaster: multiplex every ssh call over one connection. A fresh VPS is
# hammered by ssh brute-force bots within minutes, and sshd (MaxStartups)
# randomly drops new incoming connections while bots fill the pending slots —
# with multiplexing only the first connection has to get through.
SSH_OPTS=(
	-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new
	-o ControlMaster=auto -o ControlPath="$TMP/ssh" -o ControlPersist=yes
)
rssh() { ssh "${SSH_OPTS[@]}" "$TARGET" "$@"; }

# Like rssh, but retries transient connection failures (ssh exit code 255) —
# fresh droplets drop occasional connections while they finish booting. Only
# for commands that read nothing from stdin (a retry would find it drained).
rssh_retry() {
	local attempt rc
	for attempt in 1 2 3 4 5; do
		rc=0
		rssh "$@" </dev/null || rc=$?
		[ "$rc" -eq 255 ] || return "$rc"
		[ "$attempt" -lt 5 ] || break
		warn "ssh connection dropped — retrying in 5s ($attempt/5)"
		sleep 5
	done
	return "$rc"
}

# ---- phase 1: preflight ------------------------------------------------------

if [ "$ACTION" = "deploy" ]; then
	docker info >/dev/null 2>&1 || die "cannot talk to Docker — is it installed and running?"
	command -v git >/dev/null || die "git is not installed"
	if [ -z "$TAG" ]; then
		docker buildx version >/dev/null 2>&1 || die "docker buildx is not available"
		git rev-parse --short HEAD >/dev/null 2>&1 || die "not inside a git checkout"
	fi
fi

info "Checking ssh connectivity to $TARGET"
rssh_retry true 2>/dev/null || die "cannot ssh into $TARGET (key-based access required)"

# Short form: read the deployed site's domain from the server.
if [ -z "$DOMAIN" ]; then
	rssh_retry "test -f $SRV/.deploy_env" 2>/dev/null ||
		die "no Editable deployment found on $TARGET — run the first deploy explicitly: vps-deploy.sh $TARGET <domain>"
	DOMAIN="$(rssh_retry "$SUDO cat $SRV/.env" | sed -n 's|^ORIGIN="https://\([^"]*\)".*|\1|p' | sed -n '1p')"
	[ -n "$DOMAIN" ] || die "could not read the site's domain (ORIGIN) from $SRV/.env"
	validate_domain
	info "Site: $DOMAIN ($TARGET)"
fi

# ---- logs command ------------------------------------------------------------
# Follows by default, like `fly logs`; Ctrl-C exits. rssh rather than
# rssh_retry: a dropped follow should end, not silently restart mid-stream.

if [ "$ACTION" = "logs" ]; then
	LOGS_ARGS=(--tail "$LOG_TAIL")
	[ "$FOLLOW" = true ] && LOGS_ARGS+=(--follow)
	info "Logs for $CONTAINER on $TARGET (Ctrl-C to stop)"
	rssh -t "$SUDO docker logs ${LOGS_ARGS[*]} $CONTAINER"
	exit 0
fi

# ---- status command ----------------------------------------------------------
# What's running and what can be rolled back to — the tags live on the server,
# the commit messages behind them live in this checkout's git history.

if [ "$ACTION" = "status" ]; then
	{
		printf 'CONTAINER=%q\n' "$CONTAINER"
		cat <<'REMOTE'
docker ps --filter "name=^$CONTAINER$" --format '{{.Image}}|{{.Status}}'
echo ---
docker images editable --format '{{.Tag}}|{{.CreatedAt}}'
REMOTE
	} | rssh "$SUDO bash -s" >"$TMP/status"

	RUNNING_IMG="$(awk -F'|' '/^---$/ { exit } { print $1; exit }' "$TMP/status")"
	RUNNING_STATE="$(awk -F'|' '/^---$/ { exit } { print $2; exit }' "$TMP/status")"
	if [ -n "$RUNNING_IMG" ]; then
		info "Running: $RUNNING_IMG ($RUNNING_STATE) — https://$DOMAIN"
	else
		warn "no running container named $CONTAINER"
	fi

	echo
	echo "Images on the server (newest first):"
	awk 'found { print } /^---$/ { found = 1 }' "$TMP/status" |
		while IFS='|' read -r tag created; do
			base_tag="${tag%-dirty}"
			desc="$(git show -s --format=%s "$base_tag" 2>/dev/null || echo '(not a commit in this checkout)')"
			[ "$tag" = "$base_tag" ] || desc="$desc + uncommitted changes"
			marker=""
			[ "editable:$tag" = "$RUNNING_IMG" ] && marker="  ← running"
			printf '  %-16s %.16s   %s%s\n' "$tag" "$created" "$desc" "$marker"
		done
	echo
	echo "Roll back with: pnpm vps:deploy --tag <tag>"
	exit 0
fi

# ---- env command -------------------------------------------------------------
# Explicit env var management, fly-secrets style: show / set / unset. Changes
# take effect by recreating the container (env_file is baked in at creation).

# Write the Caddy vhost and reload if it changed. Idempotent, so it is safe to
# run after any env change.
configure_caddy() {
	info "Configuring Caddy for $DOMAIN"
	{
		printf 'DOMAIN=%q\n' "$DOMAIN"
		printf 'SRV=%q\n' "$SRV"
		cat <<'REMOTE'
set -euo pipefail
mkdir -p /etc/caddy/sites
site_file="/etc/caddy/sites/editable.caddy"

# Both follow the server's .env once it exists, so `env set` takes effect. On a
# first deploy it is not written yet, hence the passed-in domain.
domain="$DOMAIN"
extra=""
if [ -f "$SRV/.env" ]; then
	from_env="$(sed -n 's|^ORIGIN="https://\([^"]*\)".*|\1|p' "$SRV/.env" | sed -n '1p')"
	[ -z "$from_env" ] || domain="$from_env"
	extra="$(sed -n 's|^ALIAS_DOMAINS="\(.*\)"$|\1|p' "$SRV/.env" | sed -n '1p')"
fi
domain="$(printf '%s' "$domain" | tr '[:upper:]' '[:lower:]')"
printf '%s' "$domain" |
	grep -Eq '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' ||
	{ echo "Error: ORIGIN does not contain a valid domain: $domain" >&2; exit 1; }
site_address="$domain"
for d in $(printf '%s' "$extra" | tr ',' ' '); do
	d="$(printf '%s' "$d" | tr '[:upper:]' '[:lower:]')"
	if [ -z "$d" ] || [ "$d" = "$domain" ]; then
		continue
	fi
	printf '%s' "$d" |
		grep -Eq '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' ||
		{ echo "Error: ALIAS_DOMAINS contains an invalid domain: $d" >&2; exit 1; }
	site_address="$site_address, $d"
done

desired="$site_address {
	reverse_proxy 127.0.0.1:3000
}"
changed=""
if [ ! -f "$site_file" ] || [ "$(cat "$site_file")" != "$desired" ]; then
	printf '%s\n' "$desired" >"$site_file"
	changed=1
fi
grep -q 'import sites/\*\.caddy' /etc/caddy/Caddyfile || {
	printf '\nimport sites/*.caddy\n' >>/etc/caddy/Caddyfile
	changed=1
}
[ -z "$changed" ] || systemctl reload caddy
REMOTE
	} | rssh "$SUDO bash -s"
}

restart_with_env() {
	rssh "$SUDO tee $SRV/.env >/dev/null && $SUDO chmod 600 $SRV/.env" <"$TMP/env"
	info "Restarting the app with the new environment"
	rssh_retry "cd $SRV && $SUDO docker compose --env-file .env --env-file .deploy_env up -d"
	rssh_retry 'for i in $(seq 30); do curl -fs -o /dev/null http://127.0.0.1:3000 && exit 0; sleep 1; done; exit 1' ||
		die "the app did not come back healthy — inspect with: ssh $TARGET '$SUDO docker logs $CONTAINER'"
}

if [ "$ACTION" = "env" ]; then
	rssh "test -f $SRV/.env && test -f $SRV/.deploy_env" 2>/dev/null ||
		die "no deployment at $SRV yet — deploy first"
	rssh "$SUDO cat $SRV/.env" >"$TMP/env"
	SUB="${ENV_ARGS[0]:-show}"
	case "$SUB" in
		show)
			sed -E 's/^(ADMIN_PASSWORD|AWS_SECRET_ACCESS_KEY)=.*/\1="…"/' "$TMP/env"
			;;
		set)
			[ ${#ENV_ARGS[@]} -ge 2 ] || die "env set needs at least one KEY=VALUE (or KEY to be prompted)"
			for pair in "${ENV_ARGS[@]:1}"; do
				key="${pair%%=*}"
				echo "$key" | grep -Eq '^[A-Z][A-Z0-9_]*$' || die "'$key' is not a valid env var name"
				if [ "$pair" = "$key" ]; then
					printf 'Value for %s (input hidden): ' "$key"
					read -rs value </dev/tty
					echo
				else
					value="${pair#*=}"
				fi
				case "$value" in
					*[\"\\]*) die 'values must not contain " or \' ;;
				esac
				grep -v "^$key=" "$TMP/env" >"$TMP/env.new" || true
				printf '%s="%s"\n' "$key" "$value" >>"$TMP/env.new"
				mv "$TMP/env.new" "$TMP/env"
				info "Set $key"
			done
			restart_with_env
			configure_caddy
			;;
		unset)
			[ ${#ENV_ARGS[@]} -ge 2 ] || die "env unset needs at least one KEY"
			for key in "${ENV_ARGS[@]:1}"; do
				grep -q "^$key=" "$TMP/env" || die "$key is not set on the server"
				grep -v "^$key=" "$TMP/env" >"$TMP/env.new" || true
				mv "$TMP/env.new" "$TMP/env"
				info "Unset $key"
			done
			restart_with_env
			configure_caddy
			;;
		*) die "Unknown env command '$SUB' (expected: show, set, unset)" ;;
	esac
	exit 0
fi

REMOTE_ARCH="$(rssh_retry uname -m)"
[ "$REMOTE_ARCH" = "x86_64" ] ||
	die "server is $REMOTE_ARCH — only amd64 servers are supported (the image pins the x86_64 Litestream build)"

# DNS sanity check — warn only, propagation may still be in progress.
if echo "$HOST_ADDR" | grep -Eq '^[0-9.]+$' && command -v dig >/dev/null; then
	RESOLVED="$(dig +short A "$DOMAIN" | sed -n '1p')"
	if [ -z "$RESOLVED" ]; then
		warn "$DOMAIN does not resolve yet — TLS will fail until the A record points at $HOST_ADDR"
	elif [ "$RESOLVED" != "$HOST_ADDR" ]; then
		warn "$DOMAIN resolves to $RESOLVED, not $HOST_ADDR — TLS will fail until DNS is fixed"
	fi
fi

FIRST_RUN=false
rssh_retry "test -f $SRV/.env" 2>/dev/null || FIRST_RUN=true

if [ "$FIRST_RUN" = true ]; then
	confirm "Set up $TARGET as a new Editable server for https://$DOMAIN?"
fi

# ---- phase 2: provision (remote, idempotent) ---------------------------------

info "Provisioning server (no-op when already set up)"
{
	printf 'APP_USER=%q\n' "$REMOTE_USER"
	cat <<'REMOTE'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

command -v curl >/dev/null || { apt-get update -qq; apt-get install -y -qq curl ca-certificates; }
command -v docker >/dev/null || { echo "→ Installing Docker"; curl -fsSL https://get.docker.com | sh; }
command -v caddy >/dev/null || {
	echo "→ Installing Caddy"
	apt-get update -qq
	apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https gnupg
	curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' |
		gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
	curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
		>/etc/apt/sources.list.d/caddy-stable.list
	apt-get update -qq
	apt-get install -y -qq caddy
}

# 1 GB swap on small machines, so the running app never gets OOM-killed.
total_kb=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
if [ "$total_kb" -lt 2000000 ] && [ "$(swapon --noheadings | wc -l)" -eq 0 ]; then
	echo "→ Creating 1 GB swapfile (server has <2 GB RAM)"
	fallocate -l 1G /swapfile
	chmod 600 /swapfile
	mkswap /swapfile >/dev/null
	swapon /swapfile
	grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi

mkdir -p /data /srv/editable
[ "$APP_USER" = "root" ] || chown "$APP_USER" /data /srv/editable
REMOTE
} | rssh "$SUDO bash -s"

# ---- phase 3: configure (remote, idempotent) ---------------------------------

configure_caddy

BUCKET_KEYS="BUCKET_NAME AWS_ENDPOINT_URL_S3 AWS_REGION AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY"

# Append KEY="value" for each bucket key with a local value to the file in $1.
append_bucket_creds() {
	local key value
	for key in $BUCKET_KEYS; do
		value="$(local_env_val "$key")"
		[ -n "$value" ] && printf '%s="%s"\n' "$key" "$value" >>"$1"
	done
	return 0
}

if [ "$FIRST_RUN" = true ]; then
	info "Creating the server's .env"
	LANGS="$(local_env_val LANGUAGES)"
	[ -n "$LANGS" ] || die "set LANGUAGES in your local .env first, such as LANGUAGES=\"en\""
	GENERATED="$(openssl rand -base64 18 2>/dev/null || head -c 18 /dev/urandom | base64)"
	printf 'Admin password for %s [enter for generated: %s]: ' "$DOMAIN" "$GENERATED"
	read -r ADMIN_PW </dev/tty
	[ -n "$ADMIN_PW" ] || ADMIN_PW="$GENERATED"
	case "$ADMIN_PW" in
		*[\"\\]*) die 'the admin password must not contain " or \' ;;
	esac
	{
		printf 'ADMIN_PASSWORD="%s"\n' "$ADMIN_PW"
		printf 'ORIGIN="https://%s"\n' "$DOMAIN"
		printf 'LANGUAGES="%s"\n' "$LANGS"
	} >"$TMP/env"
	append_bucket_creds "$TMP/env"
	rssh "$SUDO tee $SRV/.env >/dev/null && $SUDO chmod 600 $SRV/.env" <"$TMP/env"
fi

# ---- phase 4: build & upload -------------------------------------------------

if [ -z "$TAG" ]; then
	TAG="$(git rev-parse --short HEAD)"
	# Uncommitted or untracked changes end up in the image — make the tag say
	# so. Deploying dirty again reuses the tag (dirty states aren't versioned;
	# commits are the rollback anchors).
	if [ -n "$(git status --porcelain)" ]; then
		TAG="$TAG-dirty"
		warn "uncommitted changes — tagging the image $TAG"
	fi
	info "Building editable:$TAG for linux/amd64"
	docker buildx build --platform linux/amd64 -t "editable:$TAG" --load .
	info "Streaming image to the server (this can take a few minutes)"
	docker save "editable:$TAG" | gzip | rssh "gunzip | $SUDO docker load"
else
	rssh "$SUDO docker image inspect editable:$TAG >/dev/null 2>&1" ||
		die "image editable:$TAG is not on the server (only built tags can be rolled back to)"
	info "Deploying existing image editable:$TAG"
fi

rssh "$SUDO tee $SRV/docker-compose.yml >/dev/null" <docker-compose.yml

# ---- phase 5: activate -------------------------------------------------------

info "Starting the new container"
printf 'IMAGE_TAG=%s\nCONTAINER_NAME=%s\nHOST_DATA_DIR=/data\n' "$TAG" "$CONTAINER" |
	rssh "$SUDO tee $SRV/.deploy_env >/dev/null"
rssh_retry "cd $SRV && $SUDO docker compose --env-file .env --env-file .deploy_env up -d --remove-orphans"

# ---- phase 6: verify ---------------------------------------------------------

info "Waiting for the app to respond"
if ! rssh_retry 'for i in $(seq 30); do curl -fs -o /dev/null http://127.0.0.1:3000 && exit 0; sleep 1; done; exit 1'; then
	echo "--- container logs -----------------------------------------------------" >&2
	rssh_retry "$SUDO docker logs --tail 50 $CONTAINER" >&2 || true
	die "the app did not become healthy — the failing container is left running for inspection"
fi

if ! curl -fsS -o /dev/null --max-time 15 "https://$DOMAIN" 2>/dev/null; then
	warn "https://$DOMAIN is not reachable from here yet (DNS propagation or TLS issuance may still be in progress)"
fi

# ---- phase 7: cleanup & report -----------------------------------------------

# Keep the newest 3 editable images for --tag rollbacks (rmi of an in-use
# image fails harmlessly, e.g. right after rolling back to an older tag).
rssh_retry "$SUDO docker images editable --format '{{.Repository}}:{{.Tag}}' | tail -n +4 | xargs -r $SUDO docker rmi >/dev/null 2>&1 || true"

echo
info "Deployed editable:$TAG to https://$DOMAIN"
if [ "$FIRST_RUN" = true ]; then
	cat <<LOCAL_ENV

Add this line to your local .env — it is this checkout's deployment identity
(like fly.toml's app name). pnpm vps:deploy / vps:status / vps:env and all
pnpm data:* commands target it; everything else is read from the server:

    DEPLOY_HOST="$TARGET"
LOCAL_ENV
fi
