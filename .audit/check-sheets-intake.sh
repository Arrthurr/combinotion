#!/usr/bin/env bash
set -euo pipefail
IDENTITY='{"subject":"user_3INjNGgfNdcUHeaIiWDfaPpsOKs","issuer":"https://clerk.joyforbooks.org","tokenIdentifier":"https://clerk.joyforbooks.org|user_3INjNGgfNdcUHeaIiWDfaPpsOKs"}'
echo "publicRequestGate"
npx convex run orgSettings:publicRequestGate --prod
echo "listHealth"
npx convex run intake:listHealth --prod --identity "$IDENTITY"
echo "item counts"
for state in pending invalid resolved; do
  npx convex run intake:listItems --prod --identity "$IDENTITY" "{\"state\":\"$state\"}" \
    | python3 -c 'import sys,json
t=sys.stdin.read(); i=t.find("["); d=json.loads(t[i:]) if i>=0 else []
kinds={}
for item in d:
  cand=(item.get("state") or {}).get("candidate") or {}
  k=cand.get("kind") or "none"
  kinds[k]=kinds.get(k,0)+1
print(sys.argv[1], len(d), kinds)
' "$state"
done
