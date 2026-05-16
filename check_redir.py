"""Follow redirects for MediaPipe WASM file."""
import requests

h = {"User-Agent": "Mozilla/5.0"}
url = "https://unpkg.com/@mediapipe/pose/pose_solution_lite_wasm_bin.wasm"
for i in range(10):
    r = requests.get(url, headers=h, allow_redirects=False, timeout=30)
    loc = r.headers.get("location", "")
    ct = r.headers.get("content-type", "")
    print(f"Step {i}: {r.status_code} type={ct[:30]} location={loc[:80]} size={len(r.content)}")
    if r.status_code in (301, 302, 307, 308):
        if loc.startswith("/"):
            from urllib.parse import urljoin
            url = urljoin("https://unpkg.com", loc)
        else:
            url = loc
    elif r.status_code == 200:
        print(f"Content first 20 bytes: {r.content[:20]}")
        break
    else:
        print(f"Body: {r.content[:100]}")
        break
