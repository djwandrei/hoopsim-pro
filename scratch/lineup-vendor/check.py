import json, hashlib
root = "/tmp/lineupzip/Lineup Lab Files"
m = json.load(open(f"{root}/COPY-MANIFEST.json"))
def sha(b): return hashlib.sha256(b).hexdigest()
for f in m["files"]:
    p = f["path"]
    if "sourceFile" not in f:
        print(f"{p}: no sourceFile, SKIP")
        continue
    raw = open(f"{root}/{p}", "rb").read()
    src = f["sourceFile"]
    # Revert standalone path adjustments back to the site's flat layout
    data = raw
    if not f["exactBytes"]:
        data = raw.replace(b"'./engine/", b"'./").replace(b'"./engine/', b'"./')
        data = data.replace(b"'./model/", b"'./").replace(b'"./model/', b'"./')
    ok_src = sha(data) == f["sourceSha256"]
    ok_self = sha(raw) == f["sha256"]
    print(f"{p} -> {src}: revert_matches_site={ok_src} self_ok={ok_self}")