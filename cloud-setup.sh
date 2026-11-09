#!/bin/bash
# cloud-setup.sh — Beelink: the rest of "iCloud without the BS", next to Immich (photos).
#   Nextcloud   → files (iCloud Drive), Contacts, Calendars, Reminders, Notes     https://<beelink>.<tailnet>.ts.net
#   Vaultwarden → passwords and passkeys, used with the Bitwarden app              https://<beelink>.<tailnet>.ts.net:8443
# Both are reachable ONLY over Tailscale (one HTTPS address that works at home and away; no router ports, no internet).
# Data lives on the internal drive for now: /srv/nextcloud and /srv/vaultwarden. Nightly database copies in /srv/backups.
# Usage (on the Beelink, as nathan):
#   bash cloud-setup.sh                      install / update (safe to re-run; keeps passwords and data)
#   bash cloud-setup.sh --check              checklist only
#   bash cloud-setup.sh --add-user NAME      create a Nextcloud account (asks for a password); e.g. --add-user wife
#   bash cloud-setup.sh --quota NAME SIZE    cap a Nextcloud account, e.g. --quota wife 300GB
#   bash cloud-setup.sh --lock-signups       after both Bitwarden accounts exist: nobody else can create one
#   bash cloud-setup.sh --open-signups       allow creating Bitwarden accounts again
set -uo pipefail
NC=/srv/nextcloud; VW=/srv/vaultwarden; BK=/srv/backups; U=$(id -un); FAIL=0
ok()   { printf '  \e[32m✓\e[0m %s\n' "$*"; }
bad()  { printf '  \e[31m✗\e[0m %s\n' "$*"; FAIL=1; }
note() { printf '  • %s\n' "$*"; }
hdr()  { printf '\n\e[1m== %s\e[0m\n' "$*"; }
[ "$(id -u)" -eq 0 ] && { echo "Run as your user (it uses sudo), not root."; exit 1; }
DK="sudo docker"
rand() { tr -dc 'A-Za-z0-9' </dev/urandom | head -c "${1:-32}"; }

# Tailscale MagicDNS name of this machine, e.g. beelink.tail1234.ts.net
ts_host() { tailscale status --json 2>/dev/null | python3 -c 'import json,sys;print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))' 2>/dev/null; }
lan_ip()  { ip -4 -o addr show | awk '$2!~/^(lo|tailscale|docker|br-|veth)/{split($4,a,"/");print a[1]}' | grep -v '^10\.77\.' | head -1; }
occ()     { (cd "$NC" && $DK compose exec -T -u www-data app php occ "$@"); }

check() {
  hdr "Checklist"
  command -v docker >/dev/null && ok "Docker $(docker --version | awk '{print $3}' | tr -d ,)" || bad "Docker missing"
  local up; up=$($DK ps --format '{{.Names}} {{.Status}}' 2>/dev/null)
  for c in nextcloud_app nextcloud_db nextcloud_redis nextcloud_cron vaultwarden; do
    echo "$up" | grep -q "^$c Up" && ok "$c running" || bad "$c not running"
  done
  curl -s -m 8 http://127.0.0.1:8080/status.php | grep -q '"installed":true' && ok "Nextcloud installed and answering on :8080" \
    || bad "Nextcloud not answering on :8080 (first start takes a minute or two: $DK compose -f $NC/docker-compose.yml logs app)"
  local v; v=$(curl -s -m 8 http://127.0.0.1:8080/status.php | python3 -c 'import json,sys;print(json.load(sys.stdin)["versionstring"])' 2>/dev/null)
  [ -n "$v" ] && ok "Nextcloud $v"
  curl -s -m 5 http://127.0.0.1:8222/alive >/dev/null && ok "Vaultwarden answering on :8222" || bad "Vaultwarden not answering on :8222"
  local host; host=$(ts_host)
  [ -n "$host" ] && ok "Tailscale name: $host" || bad "Tailscale isn't up (sudo tailscale up)"
  if tailscale serve status 2>/dev/null | grep -q '8080'; then ok "tailscale serve: HTTPS → Nextcloud and Vaultwarden"
  else bad "tailscale serve not set up: run this script again without --check"; fi
  if [ -n "$host" ]; then
    curl -s -m 15 "https://$host/status.php" | grep -q installed && ok "https://$host reaches Nextcloud (certificate OK)" \
      || bad "https://$host doesn't answer yet (the first HTTPS request fetches the certificate; wait 30 s and re-check)"
    curl -s -m 15 "https://$host:8443/alive" >/dev/null && ok "https://$host:8443 reaches Vaultwarden" || bad "https://$host:8443 doesn't answer yet"
  fi
  local su; su=$(grep -E '^SIGNUPS_ALLOWED=' "$VW/.env" 2>/dev/null | cut -d= -f2)
  [ "$su" = "true" ] && note "Bitwarden: creating accounts is OPEN (run --lock-signups once you both have one)" || note "Bitwarden: creating accounts is locked"
  if curl -s -m 8 http://127.0.0.1:8080/status.php | grep -q '"installed":true'; then
    local users; users=$(occ user:list 2>/dev/null | sed 's/^  - //' | tr '\n' ' ')
    note "Nextcloud accounts: ${users:-none yet}"
  fi
  local free; free=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
  [ "${free:-0}" -ge 60 ] && ok "free space on the internal drive: ${free} GB" || bad "only ${free} GB free on the internal drive: add the new disk soon"
  [ -f /etc/cron.d/homecloud-backup ] && ok "nightly database copies → $BK (14 days kept)" || bad "nightly backup cron missing"
  echo
  note "iPhone addresses (same at home and away; Tailscale VPN On Demand must be on):"
  note "  Nextcloud app / Files app / CardDAV / CalDAV:  https://${host:-<tailscale name>}"
  note "  Bitwarden app → self-hosted server URL:          https://${host:-<tailscale name>}:8443"
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
  id -nG | grep -qw docker || sudo usermod -aG docker "$U"
  ok "Docker $(sudo docker --version | awk '{print $3}' | tr -d ,)"

  hdr "Tailscale"
  command -v tailscale >/dev/null || { echo "Tailscale isn't installed on this machine. Stop."; exit 1; }
  HOST=$(ts_host)
  [ -n "$HOST" ] || { echo "Tailscale isn't connected (sudo tailscale up). Stop."; exit 1; }
  ok "this machine is $HOST"

  hdr "Nextcloud files in $NC"
  sudo mkdir -p "$NC/html" "$NC/data" "$NC/db" "$BK"; sudo chown "$U:$U" "$NC" "$BK"
  if [ ! -f "$NC/.env" ]; then
    cat > "$NC/.env" <<EOF
# created by cloud-setup.sh $(date +%F). Keep this file: it holds the database and admin passwords.
MYSQL_ROOT_PASSWORD=$(rand)
MYSQL_PASSWORD=$(rand)
NEXTCLOUD_ADMIN_USER=$U
NEXTCLOUD_ADMIN_PASSWORD=$(rand 20)
NEXTCLOUD_HOST=$HOST
EOF
    chmod 600 "$NC/.env"; ok ".env created (random database password; admin account '$U', password inside $NC/.env)"
  else
    grep -q '^NEXTCLOUD_HOST=' "$NC/.env" || echo "NEXTCLOUD_HOST=$HOST" >> "$NC/.env"
    ok ".env kept (existing passwords)"
  fi
  LAN=$(lan_ip); TSIP=$(tailscale ip -4 2>/dev/null | head -1)
  cat > "$NC/docker-compose.yml" <<EOF
# Nextcloud (files, contacts, calendars, reminders, notes) — written by cloud-setup.sh; re-run the script rather than editing.
services:
  db:
    image: mariadb:11
    container_name: nextcloud_db
    restart: unless-stopped
    command: --transaction-isolation=READ-COMMITTED --log-bin=binlog --binlog-format=ROW
    volumes: [ "$NC/db:/var/lib/mysql" ]
    environment:
      MYSQL_ROOT_PASSWORD: \${MYSQL_ROOT_PASSWORD}
      MYSQL_PASSWORD: \${MYSQL_PASSWORD}
      MYSQL_DATABASE: nextcloud
      MYSQL_USER: nextcloud
      MARIADB_AUTO_UPGRADE: "1"
    healthcheck:
      test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]
      interval: 10s
      timeout: 5s
      retries: 10
  redis:
    image: redis:alpine
    container_name: nextcloud_redis
    restart: unless-stopped
  app:
    image: nextcloud:stable
    container_name: nextcloud_app
    restart: unless-stopped
    depends_on:
      db: { condition: service_healthy }
      redis: { condition: service_started }
    ports: [ "127.0.0.1:8080:80" ]
    volumes:
      - "$NC/html:/var/www/html"
      - "$NC/data:/var/www/html/data"
    environment:
      MYSQL_HOST: db
      MYSQL_PASSWORD: \${MYSQL_PASSWORD}
      MYSQL_DATABASE: nextcloud
      MYSQL_USER: nextcloud
      REDIS_HOST: redis
      NEXTCLOUD_ADMIN_USER: \${NEXTCLOUD_ADMIN_USER}
      NEXTCLOUD_ADMIN_PASSWORD: \${NEXTCLOUD_ADMIN_PASSWORD}
      NEXTCLOUD_TRUSTED_DOMAINS: "\${NEXTCLOUD_HOST} ${LAN:-127.0.0.1} ${TSIP:-127.0.0.1} localhost"
      NEXTCLOUD_DATA_DIR: /var/www/html/data
      OVERWRITEPROTOCOL: https
      OVERWRITEHOST: \${NEXTCLOUD_HOST}
      OVERWRITECLIURL: https://\${NEXTCLOUD_HOST}
      TRUSTED_PROXIES: "172.16.0.0/12 127.0.0.1"
      PHP_MEMORY_LIMIT: 1G
      PHP_UPLOAD_LIMIT: 16G
      TZ: America/Chicago
  cron:
    image: nextcloud:stable
    container_name: nextcloud_cron
    restart: unless-stopped
    depends_on: [ app ]
    entrypoint: /cron.sh
    volumes:
      - "$NC/html:/var/www/html"
      - "$NC/data:/var/www/html/data"
    environment:
      MYSQL_HOST: db
      MYSQL_PASSWORD: \${MYSQL_PASSWORD}
      MYSQL_DATABASE: nextcloud
      MYSQL_USER: nextcloud
      REDIS_HOST: redis
      TZ: America/Chicago
EOF
  ok "docker-compose.yml written (Nextcloud on 127.0.0.1:8080, data in $NC/data)"

  hdr "Vaultwarden files in $VW"
  sudo mkdir -p "$VW/data"; sudo chown "$U:$U" "$VW"
  if [ ! -f "$VW/.env" ]; then
    cat > "$VW/.env" <<EOF
# created by cloud-setup.sh $(date +%F). ADMIN_TOKEN opens https://$HOST:8443/admin (rarely needed).
DOMAIN=https://$HOST:8443
SIGNUPS_ALLOWED=true
ADMIN_TOKEN=$(rand 48)
EOF
    chmod 600 "$VW/.env"; ok ".env created (account creation open for now; lock it with --lock-signups later)"
  else
    sed -i -E "s|^DOMAIN=.*|DOMAIN=https://$HOST:8443|" "$VW/.env"; ok ".env kept"
  fi
  cat > "$VW/docker-compose.yml" <<EOF
# Vaultwarden (Bitwarden-compatible password server) — written by cloud-setup.sh
services:
  vaultwarden:
    image: vaultwarden/server:latest
    container_name: vaultwarden
    restart: unless-stopped
    ports: [ "127.0.0.1:8222:80" ]
    volumes: [ "$VW/data:/data" ]
    env_file: [ "$VW/.env" ]
    environment:
      TZ: America/Chicago
      SHOW_PASSWORD_HINT: "false"
      LOG_LEVEL: warn
EOF
  ok "docker-compose.yml written (Vaultwarden on 127.0.0.1:8222, vault in $VW/data)"

  hdr "Start"
  (cd "$NC" && $DK compose pull -q && $DK compose up -d --remove-orphans) || { echo "Nextcloud compose failed. Stop."; exit 1; }
  (cd "$VW" && $DK compose pull -q && $DK compose up -d --remove-orphans) || { echo "Vaultwarden compose failed. Stop."; exit 1; }
  printf '  waiting for Nextcloud to finish installing'
  for i in $(seq 1 90); do curl -s -m 3 http://127.0.0.1:8080/status.php | grep -q '"installed":true' && break; printf '.'; sleep 4; done; echo
  curl -s -m 3 http://127.0.0.1:8080/status.php | grep -q '"installed":true' || { echo "Nextcloud didn't come up. See: $DK compose -f $NC/docker-compose.yml logs app"; exit 1; }
  ok "Nextcloud and Vaultwarden started (they restart on their own after reboots)"

  hdr "Nextcloud apps and settings"
  for a in contacts calendar tasks notes; do
    occ app:install "$a" >/dev/null 2>&1 || occ app:enable "$a" >/dev/null 2>&1; ok "app: $a"
  done
  occ app:disable firstrunwizard >/dev/null 2>&1
  occ config:system:set default_phone_region --value US >/dev/null
  occ config:system:set maintenance_window_start --type integer --value 7 >/dev/null   # 1–5 AM Central
  occ config:system:set overwritecondaddr --value '^172\.' >/dev/null                   # HTTPS rewrite only for the Tailscale proxy
  occ config:system:set trusted_domains 0 --value "$HOST" >/dev/null
  occ config:system:set trusted_domains 1 --value "${LAN:-127.0.0.1}" >/dev/null
  occ config:system:set trusted_domains 2 --value "${TSIP:-127.0.0.1}" >/dev/null
  occ background:cron >/dev/null
  occ db:add-missing-indices >/dev/null 2>&1
  ok "contacts, calendar, reminders (tasks) and notes ready; cron, region, maintenance window set"

  hdr "HTTPS over Tailscale (tailscale serve)"
  ts_serve() {  # new syntax first, then the pre-1.54 one
    sudo tailscale serve --bg --https="$1" "http://127.0.0.1:$2" >/dev/null 2>&1 \
      || sudo tailscale serve "https:$1" / "http://127.0.0.1:$2" >/dev/null 2>&1; }
  if ts_serve 443 8080 && ts_serve 8443 8222; then
    ok "https://$HOST → Nextcloud,  https://$HOST:8443 → Vaultwarden (Tailscale-only; not on the internet)"
    printf '  fetching the certificate'
    for i in $(seq 1 20); do curl -s -m 20 "https://$HOST/status.php" | grep -q installed && break; printf '.'; sleep 3; done; echo
  else
    bad "tailscale serve refused. Usually HTTPS certificates aren't enabled on your tailnet yet:"
    note "  Safari → https://login.tailscale.com/admin/dns → turn on MagicDNS and 'Enable HTTPS', then re-run this script."
  fi

  hdr "Nightly database copies"
  sudo tee /usr/local/bin/homecloud-backup >/dev/null <<EOF
#!/bin/bash
# Nightly copies of the Nextcloud database and the Vaultwarden vault into $BK (14 days). Files/photos themselves are on disk already.
set -u; D=\$(date +%F); mkdir -p $BK
docker compose -f $NC/docker-compose.yml exec -T db sh -c 'mariadb-dump --single-transaction -u nextcloud -p"\$MYSQL_PASSWORD" nextcloud' | gzip > $BK/nextcloud-db-\$D.sql.gz
python3 - <<PY
import sqlite3; s=sqlite3.connect("$VW/data/db.sqlite3"); d=sqlite3.connect("$BK/vaultwarden-\$D.sqlite3"); s.backup(d); d.close(); s.close()
PY
cp -r $VW/data/attachments $BK/vaultwarden-attachments 2>/dev/null; cp $VW/data/rsa_key* $BK/ 2>/dev/null
find $BK -name 'nextcloud-db-*' -mtime +14 -delete; find $BK -name 'vaultwarden-*.sqlite3' -mtime +14 -delete
EOF
  sudo chmod +x /usr/local/bin/homecloud-backup
  echo "20 3 * * * root /usr/local/bin/homecloud-backup >/dev/null 2>&1" | sudo tee /etc/cron.d/homecloud-backup >/dev/null
  ok "3:20 AM every night → $BK"

  check
  echo
  echo "Next:"
  echo "  1. bash cloud-setup.sh --add-user wife          (her Nextcloud login; yours is '$U', password in $NC/.env)"
  echo "  2. On each iPhone: Bitwarden app → self-hosted → https://$HOST:8443 → Create account."
  echo "  3. Then: bash cloud-setup.sh --lock-signups"
}

add_user() {
  local name=$1 pw
  [ -n "$name" ] || { echo "Usage: --add-user NAME"; exit 1; }
  read -rsp "Password for Nextcloud account '$name': " pw; echo
  (cd "$NC" && $DK compose exec -T -u www-data -e OC_PASS="$pw" app php occ user:add --password-from-env --display-name "$name" "$name") \
    && ok "Nextcloud account '$name' created. Login on the iPhone: https://$(ts_host)  user $name" || bad "couldn't create '$name' (already exists?)"
}

quota() { [ -n "${2:-}" ] || { echo "Usage: --quota NAME SIZE   e.g. --quota wife 300GB"; exit 1; }
  occ user:setting "$1" files quota "$2" && ok "$1 capped at $2"; }

signups() { sed -i -E "s|^SIGNUPS_ALLOWED=.*|SIGNUPS_ALLOWED=$1|" "$VW/.env"; (cd "$VW" && $DK compose up -d >/dev/null 2>&1)
  [ "$1" = true ] && ok "Bitwarden account creation is open" || ok "Bitwarden account creation is locked (existing accounts unaffected)"; }

case "${1:-}" in
  --check) check ;;
  --add-user) add_user "${2:-}" ;;
  --quota) quota "${2:-}" "${3:-}" ;;
  --lock-signups) signups false ;;
  --open-signups) signups true ;;
  *) install ;;
esac
