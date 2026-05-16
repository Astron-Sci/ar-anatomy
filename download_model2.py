"""Download MediaPipe model files, following redirects."""
import requests
from pathlib import Path

OUT = Path(__file__).parent / "pose_model"
OUT.mkdir(exist_ok=True)
h = {"User-Agent": "Mozilla/5.0"}

files = [
    "pose_solution_lite_wasm_bin.wasm",
    "pose_solution_lite_model.bin",
]
for fname in files:
    url = f"https://unpkg.com/@mediapipe/pose/{fname}"
    r = requests.get(url, headers=h, timeout=30, allow_redirects=False)
    print(f"{fname}: status={r.status_code}")
    if r.status_code in (301, 302):
        loc = r.headers.get("location", "")
        if loc.startswith("/"):
            # Fix relative redirect
            from urllib.parse import urljoin
            loc = urljoin(url, loc)
        print(f"  --> {loc}")
        r2 = requests.get(loc, headers=h, timeout=120, allow_redirects=True)
        print(f"  Final: {r2.status_code}, {len(r2.content)} bytes")
        if r2.status_code == 200 and len(r2.content) > 1000:
            fpath = OUT / fname
            fpath.write_bytes(r2.content)
            print(f"  Saved: {fpath} ({len(r2.content)//1024} KB)")
    else:
        print(f"  Content: {r.content[:100]}")
