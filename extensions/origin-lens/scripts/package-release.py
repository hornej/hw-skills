"""Build a reproducible, runtime-only Chrome Web Store ZIP (Python 3)."""
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = (
    "manifest.json", "background.js", "content.js", "core.js", "network.js",
    "credentials.js", "ocr.js", "ocr-engine.js", "ocr-bridge.js", "st-options.js",
    "offscreen.html", "offscreen.js", "popup.html", "popup.css", "popup.js",
    "popup-api.js", "LICENSE", "THIRD_PARTY_NOTICES.md",
    "icons/icon-16.png", "icons/icon-32.png", "icons/icon-48.png", "icons/icon-128.png",
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def zip_bytes(payload):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(payload.items()):
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data, compresslevel=9)
    return buffer.getvalue()


def build():
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    if manifest["manifest_version"] != 3 or not re.fullmatch(r"\d+(?:\.\d+){0,3}", version):
        raise ValueError("A Manifest V3 release version is required")
    if "key" in manifest or "update_url" in manifest:
        raise ValueError("Do not package a development key or custom update URL")
    vendor = ROOT / "vendor/ocr"
    hashes = json.loads((vendor / "SHA256.json").read_text(encoding="utf-8"))
    names = sorted((*RUNTIME, "vendor/ocr/SHA256.json", *(f"vendor/ocr/{n}" for n in hashes)))
    payload = {}
    for name in names:
        if Path(name).is_absolute() or ".." in Path(name).parts:
            raise ValueError("Unexpected archive path")
        payload[name] = (ROOT / name).read_bytes()
    for name, expected in hashes.items():
        if digest(payload[f"vendor/ocr/{name}"]) != expected:
            raise ValueError(f"Bundled OCR hash mismatch: {name}")
    for size in (16, 32, 48, 128):
        image = payload[f"icons/icon-{size}.png"]
        if image[:8] != b"\x89PNG\r\n\x1a\n" or int.from_bytes(image[16:20], "big") != size or int.from_bytes(image[20:24], "big") != size:
            raise ValueError(f"Incorrect icon dimensions: {size}")
    references = [manifest["background"]["service_worker"], manifest["action"]["default_popup"]]
    references += list(manifest["icons"].values()) + list(manifest["action"]["default_icon"].values())
    references += [name for script in manifest["content_scripts"] for name in script["js"]]
    for name in references:
        if name not in payload:
            raise ValueError(f"Missing manifest asset: {name}")
    # No credential reads are needed to build a release. Fail closed if a
    # credential literal or private key was accidentally added to first-party code.
    secret_patterns = (
        rb"-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----",
        rb"(?i)(?:apiKey|client_secret|secretKey|accessToken)\s*[:=]\s*[\"'][A-Za-z0-9_./+\-=]{20,}[\"']",
        rb"(?i)[\"'][0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[\"']",
    )
    for name in RUNTIME:
        if name.endswith((".js", ".html", ".json")) and any(re.search(pattern, payload[name]) for pattern in secret_patterns):
            raise ValueError(f"Potential credential literal in {name}; inspect locally before packaging")
    data = zip_bytes(payload)
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        if archive.testzip() or set(archive.namelist()) != set(payload):
            raise ValueError("Archive validation failed")
    # Detect edits made while the archive was being assembled.
    if any((ROOT / name).read_bytes() != content for name, content in payload.items()):
        raise RuntimeError("Runtime files changed during packaging; run again")
    out = ROOT / "dist"
    out.mkdir(exist_ok=True)
    filename = f"origin-lens-{version}.zip"
    (out / filename).write_bytes(data)
    (out / f"{filename}.sha256").write_text(f"{digest(data)}  {filename}\n", encoding="utf-8")
    try:
        commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
        dirty = bool(subprocess.check_output(["git", "status", "--porcelain", "--", "."], cwd=ROOT, text=True).strip())
    except (OSError, subprocess.CalledProcessError):
        commit, dirty = None, None
    inventory = {"version": version, "archive": filename, "sha256": digest(data),
                 "bytes": len(data), "sourceCommit": commit, "workingTreeHasChanges": dirty,
                 "files": {name: {"bytes": len(content), "sha256": digest(content)} for name, content in payload.items()}}
    (out / f"origin-lens-{version}-inventory.json").write_text(json.dumps(inventory, indent=2) + "\n", encoding="utf-8")
    print(f"{out / filename}\n{len(payload)} files; {len(data):,} bytes\nSHA-256 {digest(data)}")
    kit = {filename: data, f"{filename}.sha256": (out / f"{filename}.sha256").read_bytes(),
           "release-inventory.json": (out / f"origin-lens-{version}-inventory.json").read_bytes()}
    for name in ("PRIVACY.md", "CHROMEWEBSTORE.md", "README.md", "LICENSE", "icons/icon-128.png",
                 "store-assets/README.md", "store-assets/01-source-reports.jpg", "store-assets/02-component-controls.jpg",
                 "store-assets/03-package-photo.jpg", "store-assets/promo-440x280.jpg", "store-assets/promo-440x280.svg"):
        kit[name] = (ROOT / name).read_bytes()
    kit_name = f"origin-lens-{version}-publish-kit.zip"
    (out / kit_name).write_bytes(zip_bytes(kit))
    print(f"Publication kit: {out / kit_name}\nUpload the inner {filename} as the extension, not the publication kit.")


if __name__ == "__main__":
    build()
