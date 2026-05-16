"""Download actual MediaPipe model files from jsDelivr."""
import requests
from pathlib import Path

OUT = Path(__file__).parent / "pose_model"
OUT.mkdir(exist_ok=True)
h = {"User-Agent": "Mozilla/5.0"}

base = "https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/"
files = [
    "pose_solution_wasm_bin.wasm",
    "pose_landmark_lite.tflite",
]
for fname in files:
    url = base + fname
    fpath = OUT / fname
    print(f"Downloading {fname}...")
    try:
        r = requests.get(url, headers=h, timeout=120)
        if r.status_code == 200 and len(r.content) > 1000:
            fpath.write_bytes(r.content)
            print(f"  OK: {fname} ({len(r.content)//1024} KB)")
        else:
            print(f"  FAIL: {r.status_code} ({len(r.content)} bytes)")
            # Try jsDelivr CDN with different path
            alt = f"https://cdn.jsdelivr.net/npm/@mediapipe/pose/{fname}"
            r2 = requests.get(alt, headers=h, timeout=120)
            if r2.status_code == 200 and len(r2.content) > 1000:
                fpath.write_bytes(r2.content)
                print(f"  OK (alt): {fname} ({len(r2.content)//1024} KB)")
            else:
                print(f"  ALSO FAILED: {r2.status_code}")
    except Exception as e:
        print(f"  ERROR: {e}")

print("\nFinal files:")
for f in sorted(OUT.iterdir()):
    print(f"  {f.name}: {f.stat().st_size//1024} KB")
