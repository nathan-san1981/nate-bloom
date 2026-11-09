#!/bin/bash
# immich-setup.sh — Beelink: Immich photo server (iPhone/iPad photo + video backup, timeline, search).
# Library on the internal drive for now: /srv/immich/library. Moving it to a new disk later = mount + copy + one line.
# Usage (on the Beelink, as nathan):
#   bash immich-setup.sh          install / update (safe to re-run; keeps your database password and photos)
#   bash immich-setup.sh --check  checklist only
set -uo pipefail
D=/srv/immich; U=$(id -un); FAIL=0
ok()   { printf '  \e[32m✓\e[0m %s\n' "$*"; }
bad()  { printf '  \e[31m✗\e[0m %s\n' "$*"; FAIL=1; }
note() { printf '  • %s\n' "$*"; }
hdr()  { printf '\n\e[1m== %s\e[0m\n' "$*"; }
[ "$(id -u)" -eq 0 ] && { echo "Run as your user (it uses sudo), not root."; exit 1; }
DK="docker"; id -nG | grep -qw docker || DK="sudo docker"

check() {
  hdr "Checklist"
  command -v docker >/dev/null && ok "Docker $(docker --version | awk '{print $3}' | tr -d ,)" || bad "Docker missing"
  local up; up=$($DK ps --format '{{.Names}} {{.Status}}' 2>/dev/null | grep immich)
  for c in immich_server immich_machine_learning immich_postgres immich_redis; do
    echo "$up" | grep -q "^$c Up" && ok "$c running" || bad "$c not running ($DK compose -f $D/docker-compose.yml logs $c)"
  done
  curl -s -m 5 http://127.0.0.1:2283/api/server/ping | grep -q pong && ok "Immich answering on :2283" || bad "Immich not answering on :2283"
  local v; v=$(curl -s -m 5 http://127.0.0.1:2283/api/server/version | python3 -c 'import json,sys;d=json.load(sys.stdin);print("%s.%s.%s"%(d["major"],d["minor"],d["patch"]))' 2>/dev/null)
  [ -n "$v" ] && ok "Immich v$v"
  local lan ts; lan=$(ip -4 -o addr show | awk '$2!~/^(lo|tailscale|docker|br-|veth)/{split($4,a,"/");print a[1]}' | grep -v '^10\.77\.' | head -1)
  ts=$(tailscale ip -4 2>/dev/null | head -1)
  note "iPhone server URL at home:  http://${lan:-<home Wi-Fi IP>}:2283"
  note "iPhone server URL away:     http://${ts:-<tailscale IP>}:2283"
  local free; free=$(df -BG --output=avail "$D" | tail -1 | tr -dc 0-9)
  [ "${free:-0}" -ge 60 ] && ok "free space on the library drive: ${free} GB" \
    || bad "only ${free} GB free on the library drive: Tandem needs 15 GB of it; add the new disk soon"
  du -sh "$D/library" 2>/dev/null | awk '{print "  • library size: " $1}'
  [ -d "$D/library/backups" ] && note "nightly database dumps: $D/library/backups (Immich does these itself)"
  echo; [ $FAIL -eq 0 ] && echo "All checks passed." || echo "Some checks failed (see ✗ above)."
}

install() {
  sudo -v || exit 1
  hdr "Docker"
  if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
    sudo apt-get update -qq
    sudo apt-get install -y docker.io docker-compose-v2 >/dev/null || { echo "Docker install failed. Stop."; exit 1; }
  fi
  sudo systemctl enable --now docker >/dev/null 2>&1
  id -nG | grep -qw docker || { sudo usermod -aG docker "$U"; note "added $U to the docker group (takes effect next login; using sudo for now)"; }
  ok "Docker $(sudo docker --version | awk '{print $3}' | tr -d ,)"

  hdr "Immich files in $D"
  sudo mkdir -p "$D/library" "$D/postgres"; sudo chown "$U:$U" "$D"
  curl -fsSL -o "$D/docker-compose.yml" https://github.com/immich-app/immich/releases/latest/download/docker-compose.yml \
    || { echo "Couldn't download Immich's docker-compose.yml. Stop."; exit 1; }
  if [ ! -f "$D/.env" ]; then
    curl -fsSL -o "$D/.env" https://github.com/immich-app/immich/releases/latest/download/example.env || { echo "Couldn't download example.env. Stop."; exit 1; }
    PW=$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32)
    sed -i -E "s|^UPLOAD_LOCATION=.*|UPLOAD_LOCATION=$D/library|; s|^DB_DATA_LOCATION=.*|DB_DATA_LOCATION=$D/postgres|; \
               s|^DB_PASSWORD=.*|DB_PASSWORD=$PW|; s|^#? *TZ=.*|TZ=America/Chicago|" "$D/.env"
    grep -q '^TZ=' "$D/.env" || echo 'TZ=America/Chicago' >> "$D/.env"
    chmod 600 "$D/.env"; ok ".env created (random database password, library $D/library)"
  else ok ".env kept (existing password and paths)"; fi
  grep -E '^(UPLOAD_LOCATION|DB_DATA_LOCATION)=' "$D/.env" | sed 's/^/    /'

  hdr "Start"
  (cd "$D" && sudo docker compose pull -q && sudo docker compose up -d --remove-orphans) || { echo "docker compose failed. Stop."; exit 1; }
  for i in $(seq 1 60); do curl -s -m 2 http://127.0.0.1:2283/api/server/ping | grep -q pong && break; sleep 3; done
  ok "Immich started (containers restart on their own after reboots)"

  hdr "Firewall"
  if sudo ufw status 2>/dev/null | grep -q "Status: active"; then
    for src in 192.168.0.0/16 10.77.0.0/24 100.64.0.0/10; do sudo ufw allow proto tcp from $src to any port 2283 >/dev/null; done
    ok "ufw: 2283 open to home Wi-Fi, desk network and Tailscale only"
  else note "ufw inactive: nothing to open (not reachable from the internet either way: no router port is forwarded)"; fi

  check
  echo
  echo "Next: on the iPhone, open the 'home' URL above in Safari and create the admin account (that's you)."
}

if [ "${1:-}" = "--check" ]; then DK="sudo docker"; check; else install; fi
