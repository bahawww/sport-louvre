#!/bin/sh
# Publish sport-dashboard at https://sport.louvre.my.id via the existing Cloudflare Tunnel.
#  1. Insert ingress rule sport.louvre.my.id -> http://localhost:8310 before catch-all
#     (existing rules untouched; previous tunnel config backed up first)
#  2. Create proxied DNS CNAME sport -> <tunnel>.cfargotunnel.com if missing
# Idempotent: safe to re-run. API token read from ~/.cloudflare-token (never printed).
set -eu
HOST="${HOST:-sport.louvre.my.id}"
ORIGIN="${ORIGIN:-http://localhost:8310}"
ZONE=34370166f45a38533581fbc3a4a559ef
TUNNEL=7651720b-c7e8-44c4-bce1-2c4147e1177d
API=https://api.cloudflare.com/client/v4
AUTH="Authorization: Bearer $(cat "$HOME/.cloudflare-token")"
BACKUP_DIR="/opt/sport-dashboard/backups"
mkdir -p "$BACKUP_DIR"

ACCOUNT=$(curl -fsS -H "$AUTH" "$API/zones/$ZONE" | python3 -c 'import json,sys;print(json.load(sys.stdin)["result"]["account"]["id"])')

before="$BACKUP_DIR/tunnel-config-$(date +%Y%m%d-%H%M%S).json"
curl -fsS -H "$AUTH" "$API/accounts/$ACCOUNT/cfd_tunnel/$TUNNEL/configurations" > "$before"
echo "saved previous tunnel config: $before"

new=$(python3 - "$before" "$HOST" "$ORIGIN" <<'EOF'
import json, sys
path, host, origin = sys.argv[1:]
cfg = json.load(open(path))["result"]["config"]
ing = cfg["ingress"]
if any(r.get("hostname") == host for r in ing):
    print("")  # already exists
    sys.exit()
assert "hostname" not in ing[-1], "last rule must be catch-all"
ing.insert(len(ing) - 1, {"hostname": host, "service": origin, "originRequest": {}})
print(json.dumps({"config": cfg}))
EOF
)
if [ -n "$new" ]; then
  printf '%s' "$new" | curl -fsS -X PUT -H "$AUTH" -H 'Content-Type: application/json' --data @- \
    "$API/accounts/$ACCOUNT/cfd_tunnel/$TUNNEL/configurations" \
    | python3 -c 'import json,sys;d=json.load(sys.stdin);print("ingress added, version", d["result"]["version"])'
else
  echo "ingress for $HOST already exists"
fi

name="${HOST%%.*}"
exists=$(curl -fsS -H "$AUTH" "$API/zones/$ZONE/dns_records?name=$HOST" | python3 -c 'import json,sys;print(len(json.load(sys.stdin)["result"]))')
if [ "$exists" = 0 ]; then
  curl -fsS -X POST -H "$AUTH" -H 'Content-Type: application/json' \
    --data "{\"type\":\"CNAME\",\"name\":\"$name\",\"content\":\"$TUNNEL.cfargotunnel.com\",\"proxied\":true,\"comment\":\"Sport Dashboard via tunnel\"}" \
    "$API/zones/$ZONE/dns_records" \
    | python3 -c 'import json,sys;d=json.load(sys.stdin)["result"];print("DNS created:", d["name"], d["type"], "proxied" if d["proxied"] else "")'
else
  echo "DNS $HOST already exists"
fi
echo "done. check: curl -sI https://$HOST/ | head -1"
