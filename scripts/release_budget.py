#!/usr/bin/env python3
import argparse,pathlib,re,json,datetime
root=pathlib.Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument("--version",required=True);p.add_argument("--sha",required=True);a=p.parse_args()
v=a.version
assert re.fullmatch(r"\d+(\.\d+){3}",v)
conf=root/"budget-familiare/shared/app-config.js"
s=conf.read_text()
s=re.sub(r"const APP_VERSION='[^']*';","const APP_VERSION='V"+v+"';",s)
s=re.sub(r"const APP_RELEASE='[^']*';","const APP_RELEASE='Release "+v+"';",s)
conf.write_text(s)
for path in [root/"budget-familiare/index.html",root/"budget-familiare/reporting/index.html"]:
 s=path.read_text()
 s=re.sub(r'((?:src|href)="(?:\.\./)?shared/[^"]+\.(?:js|css))\?v=[^"]+(")',lambda m:m[1]+"?v="+v+"-"+a.sha[:8]+m[2],s)
 path.write_text(s)
(root/"budget-familiare/version.json").write_text(json.dumps({"version":"V"+v,"source_sha":a.sha,"built_at":datetime.datetime.now(datetime.timezone.utc).isoformat()})+"\n")
print("Built V"+v)
