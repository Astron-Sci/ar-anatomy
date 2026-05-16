"""Find the actual file names in @mediapipe/pose package."""
import requests
h = {"User-Agent": "Mozilla/5.0"}
files = [
    "pose_solution_lite_wasm_bin.wasm",
    "pose_solution_full_wasm_bin.wasm",
    "pose_solution_heavy_wasm_bin.wasm",
    "pose_solution_lite_model.bin",
    "pose_solution_full_model.bin",
    "pose_solution_heavy_model.bin",
    "pose.npm.json",
    "package.json",
]
for f in files:
    url = f"https://unpkg.com/@mediapipe/pose/{f}"
    r = requests.head(url, headers=h, timeout=30)
    ct = r.headers.get("content-type", "")[:30]
    print(f"{f:45s} {r.status_code} {ct}")
