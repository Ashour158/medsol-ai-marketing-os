"""CI archive lineage for both classic Docker and containerd image stores.
Docker's reported ID can represent a manifest rather than exported config.
Verify actual uncompressed layer bytes and runtime config, not assumed ID equivalence.
"""
import gzip
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
    entry = manifest[0]
    config_bytes = tar.extractfile(entry["Config"]).read()
    config_digest = "sha256:" + hashlib.sha256(config_bytes).hexdigest()
    config = json.loads(config_bytes)
    if config["rootfs"]["diff_ids"] != layers or len(entry["Layers"]) != len(layers):
        raise ValueError("Archive layer list differs from Docker inspection")
    for key in ("architecture", "os"):
        if config.get(key) != meta.get({"architecture": "Architecture", "os": "Os"}[key]):
            raise ValueError("Archive platform differs from Docker inspection")
    for key in ("User", "WorkingDir", "Env", "Entrypoint", "Cmd", "ExposedPorts"):
        if (config["config"].get(key) or None) != (meta["Config"].get(key) or None):
            raise ValueError("Archive runtime config differs: " + key)
    # Match every archive layer's actual uncompressed bytes against the
    # inspected root filesystem, including compressed OCI exports.
    for path, expected in zip(entry["Layers"], layers):
        with tar.extractfile(path) as raw:
            magic = raw.read(4)
            raw.seek(0)
            if magic[:2] == b"\x1f\x8b":
                with gzip.GzipFile(fileobj=raw) as stream:
                    digest = hashlib.file_digest(stream, "sha256").hexdigest()
            elif magic == b"\x28\xb5\x2f\xfd":
                raise ValueError("Unsupported zstd archive; export gzip or uncompressed layers")
            else:
                digest = hashlib.file_digest(raw, "sha256").hexdigest()
        if "sha256:" + digest != expected:
            raise ValueError("Archive layer bytes differ from inspected filesystem")
with open(archive, "rb") as fd:
    digest = hashlib.file_digest(fd, "sha256").hexdigest()
print(json.dumps({"target": target, "tag": tag, "dockerImageId": image_id,
                  "archiveConfigDigest": config_digest, "diffIds": layers,
                  "archiveSha256": "sha256:" + digest}, sort_keys=True))
