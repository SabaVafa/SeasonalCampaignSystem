#!/usr/bin/env python3
"""
One-time enrichment: fetch og:image for the top showcase products in each finder
dataset and write data/product-images.json  ->  { sku: imageUrl }.

The finder JSONs carry no image URLs, and image URLs can't be derived from the
product URL (they embed a media id we don't have), so we fetch each product page.
Pages are ~2 MB, so we read in chunks and stop as soon as og:image is found in
the <head>. Re-runnable: merges into any existing map, skips SKUs already present
(pass --force to refetch).
"""
import json, os, re, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FINDER_DIR = os.path.join(ROOT, "Json Folder")
OUT = os.path.join(ROOT, "data", "product-images.json")

FINDER_FILES = [
    "briefkasten-finder.json", "paketboxen-finder.json", "muelltonnenbox-finder.json",
    "tuersprechanlagen-finder.json", "sicherheitstechnik-finder.json", "tuerklingel-finder.json",
]
TOP_PER_CATEGORY = 18          # covers every campaign grid with margin
ACCESSORY_RE = re.compile(r"(Ersatz|Zubeh|Reiniger|Pflege|Montage|Anschlussdose|Gravurleiste|Konfigurator|Namensschild|Namens- )", re.I)
OG_RE = re.compile(r"property=[\"']og:image[\"'][^>]+content=[\"']([^\"']+)")

force = "--force" in sys.argv


def is_showcase(p):
    cats = p.get("categories") or []
    has_main = any(not ACCESSORY_RE.search(c) for c in cats)
    price = (p.get("price_eur_gross") or {}).get("from")
    return has_main and price is not None and price >= 15


def rank(p):
    return (p.get("variants_count") or 1) * 3 + (p.get("cross_sell_count") or 0)


def collect_products():
    seen, out = set(), []
    for f in FINDER_FILES:
        path = os.path.join(FINDER_DIR, f)
        data = json.load(open(path, encoding="utf-8"))
        prods = [p for p in data.get("products", []) if is_showcase(p) and p.get("url")]
        prods.sort(key=rank, reverse=True)
        for p in prods[:TOP_PER_CATEGORY]:
            if p["sku"] not in seen:
                seen.add(p["sku"])
                out.append({"sku": p["sku"], "url": p["url"]})
    return out


def fetch_og_image(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        r = urllib.request.urlopen(req, timeout=25)
        buf = b""
        while len(buf) < 300_000:                 # cap: og:image lives in <head>
            chunk = r.read(16_384)
            if not chunk:
                break
            buf += chunk
            m = OG_RE.search(buf.decode("utf-8", "ignore"))
            if m:
                r.close()
                return m.group(1)
        m = OG_RE.search(buf.decode("utf-8", "ignore"))
        return m.group(1) if m else None
    except Exception as e:
        return None


def main():
    existing = {}
    if os.path.exists(OUT) and not force:
        existing = json.load(open(OUT, encoding="utf-8"))

    todo = [p for p in collect_products() if force or p["sku"] not in existing]
    print(f"{len(todo)} products to fetch ({len(existing)} already cached)")

    results, done, failed = dict(existing), 0, 0
    with ThreadPoolExecutor(max_workers=10) as ex:
        futs = {ex.submit(fetch_og_image, p["url"]): p for p in todo}
        for fut in futs:
            pass
        for fut, p in list(futs.items()):
            img = fut.result()
            done += 1
            if img:
                results[p["sku"]] = img
            else:
                failed += 1
                print("  ! no image:", p["sku"], p["url"])

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(results, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1, sort_keys=True)
    print(f"done: {len(results)} images total, {failed} failed this run -> {OUT}")


if __name__ == "__main__":
    main()
