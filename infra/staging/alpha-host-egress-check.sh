#!/usr/bin/env bash
# Run only on the authorized persistent Alpha host. No firewall modification.
# Usage: bash alpha-host-egress-check.sh API_CONTAINER WEB_CONTAINER CONTROLLED_CANARY_IPV4 CONTROLLED_CANARY_PORT
# Canary must be controlled by the operator, reachable from host, outside the
# approved DB/IdP allowlist, and listen on the specified TCP port.
set -euo pipefail
[[ $# == 4 ]] || { echo 'Usage: API_CONTAINER WEB_CONTAINER CONTROLLED_CANARY_IPV4 CONTROLLED_CANARY_PORT'; exit 2; }
api="$1"; web="$2"; canary="$3"; port="$4"
[[ "$api" != "$web" && "$canary" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ && "$port" =~ ^[0-9]{1,5}$ ]] || exit 2
# Establish positive host control first. Refuse an unavailable test target.
timeout 5 bash -c 'exec 3<>"/dev/tcp/$1/$2"' _ "$canary" "$port" || { echo 'Canary not reachable from host; test invalid'; exit 1; }
for svc in "$api" "$web"; do
  [[ "$(docker inspect "$svc" --format '{{.State.Running}}')" == true ]] || exit 1
  # Check actual configured authority connectivity and probe denial in same
  # process namespace. Output only booleans, not URLs, tokens or passwords.
  docker exec "$svc" node -e '
   const net=require("node:net"),[canary,port,kind]=process.argv.slice(1);
   const tcp=(host,port)=>new Promise(resolve=>{
    const s=net.createConnection({host,port});let done=false;
    const end=v=>{if(done)return;done=true;s.destroy();resolve(v)};
    s.setTimeout(4000);s.once("connect",()=>end(true));s.once("error",()=>end(false));s.once("timeout",()=>end(false));
   });
   (async()=>{
    if(net.isIP(canary)!==4||+port<1||+port>65535)throw Error("Invalid canary");
    if(process.env.MARKETING_IDENTITY_PROVIDER!=="STAGING_OIDC"||
       process.env.MARKETING_EXTERNAL_EFFECTS_ENABLED!=="false"||
       process.env.MARKETING_AI_REASONING_ENABLED!=="false"||
       process.env.MARKETING_REAL_EMAIL_ENABLED!=="false")throw Error("Not offline Alpha");
    const issuer=new URL(process.env.MARKETING_OIDC_ISSUER);
    if(issuer.protocol!=="https:")throw Error("HTTPS required");
    const required=[["identity",issuer.hostname,Number(issuer.port||443)]];
    if(kind==="api"){
     const db=new URL(process.env.DATABASE_URL);
     required.push(["database",db.hostname,Number(db.port||5432)]);
    }else{
     const backend=new URL(process.env.MARKETING_API_INTERNAL_URL);
     required.push(["backend",backend.hostname,Number(backend.port||(backend.protocol==="https:"?443:80))]);
    }
    for(const [label,host,p] of required){if(!await tcp(host,p))throw Error("Required authority unreachable: "+label);}
    if(await tcp(canary,Number(port)))throw Error("Denied canary was reachable");
    console.log(JSON.stringify({service:kind,requiredAuthorityTcpReachable:true,controlledCanaryTcpDenied:true}));
   })().catch(e=>{console.error(e.message);process.exitCode=1});
  ' "$canary" "$port" "$([[ "$svc" == "$api" ]] && echo api || echo web)"
done
echo 'HOST_CONTROLLED_CANARY_CHECK_PASSED_NOT_COMPREHENSIVE_FIREWALL_OR_TLS_CERTIFICATION'
