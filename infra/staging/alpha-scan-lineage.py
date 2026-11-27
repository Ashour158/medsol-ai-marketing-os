"""CI archive lineage; do not trust scanner-specific reserialized config IDs."""
import hashlib
import json
import pathlib
import re
import sys
import tarfile

target, inspect_path, archive = sys.argv[1:]
if target not in ("api", "web"):
    raise ValueError("Unexpected image target")
meta = json.loads(pathlib.Path(inspect_path).read_text())
tag = "medsol-alpha-" + target + ":ci"
image_id = meta["Id"]
layers = meta["RootFS"]["Layers"]
valid = lambda s: bool(re.fullmatch(r"sha256:[a-f0-9]{64}", s))
if not valid(image_id) or not layers or not all(map(valid, layers)):
    raise ValueError("Missing Docker image identity")
with tarfile.open(archive, "r") as tar:
    manifest = json.load(tar.extractfile("manifest.json"))
    if len(manifest) != 1 or manifest[0].get("RepoTags") != [tag]:
        raise ValueError("Unexpected archive target")
    config = tar.extractfile(manifest[0]["Config"]).read()
    if "sha256:" + hashlib.sha256(config).hexdigest() != image_id:
        raise ValueError("Archive config bytes do not match Docker image ID")
    if json.loads(config)["rootfs"]["diff_ids"] != layers:
        raise ValueError("Archive layers differ from Docker inspection")
with open(archive, "rb") as fd:
    digest = hashlib.file_digest(fd, "sha256").hexdigest()
print(json.dumps({"target": target, "tag": tag, "dockerImageId": image_id,
                  "diffIds": layers, "archiveSha256": "sha256:" + digest},
                 sort_keys=True))
