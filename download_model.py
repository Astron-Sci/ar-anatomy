"""Download MediaPipe Pose model files for local bundling."""
import requests, sys
from pathlib import Path

OUT = Path(__file__).parent / "pose_model"
OUT.mkdir(exist_ok=True)

H = {"User-Agent": "Mozilla/5.0"}

files = {
    "pose_solution_lite_wasm_bin.wasm": "https://unpkg.com/@mediapipe/pose/pose_solution_lite_wasm_bin.wasm",
    "pose_solution_lite_model.bin": "https://unpkg.com/@mediapipe/pose/pose_solution_lite_model.bin",
}

print("Downloading MediaPipe Pose model files...")
for name, url in files.items():
    fpath = OUT / name
    if fpath.exists() and fpath.stat().st_size > 1000:
        print(f"  Already exists: {name} ({fpath.stat().st_size//1024} KB)")
        continue
    try:
        r = requests.get(url, headers=H, timeout=120)
        if r.status_code == 200 and len(r.content) > 1000:
            fpath.write_bytes(r.content)
            print(f"  OK: {name} ({len(r.content)//1024} KB)")
        else:
            print(f"  FAIL: {url} -> status={r.status_code}, size={len(r.content)}")
    except Exception as e:
        print(f"  ERROR downloading {name}: {e}")

print(f"\nFiles in {OUT}:")
for f in sorted(OUT.iterdir()):
    print(f"  {f.name}: {f.stat().st_size//1024} KB")
