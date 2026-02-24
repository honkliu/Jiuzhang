"""
mongo_bench_all.py
------------------
1. Clean duplicate emotion_generated docs (keep latest per sourceAvatarId+emotion).
2. Benchmark all 26 original avatars via direct MongoDB query.
3. Benchmark the same avatars via the API endpoint (requires --api-token or --login).
4. Print a side-by-side comparison table.

Usage:
    python3 mongo_bench_all.py                         # Mongo only
    python3 mongo_bench_all.py --login user pass       # Login then hit API too
    python3 mongo_bench_all.py --api-token <JWT>       # Supply token directly
    python3 mongo_bench_all.py --api-url http://...    # Override API base (default: http://localhost:5001)
"""

import argparse
import json
import time
from pathlib import Path

import requests
from pymongo import MongoClient, DESCENDING

EMOTIONS = [
    "angry", "smile", "sad", "happy", "crying",
    "thinking", "surprised", "neutral", "excited",
]

# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

def load_settings() -> dict:
    settings_path = Path(__file__).resolve().parents[1] / "KanKan" / "server" / "appsettings.json"
    with settings_path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

def cleanup_duplicates(collection) -> int:
    """Delete duplicate emotion_generated docs, keeping only the latest per (sourceAvatarId, emotion)."""
    pipeline = [
        {"$match": {"imageType": "emotion_generated", "emotion": {"$in": EMOTIONS}}},
        {"$sort": {"createdAt": -1}},
        {"$group": {
            "_id": {"sourceAvatarId": "$sourceAvatarId", "emotion": "$emotion"},
            "keepId": {"$first": "$_id"},
            "allIds": {"$push": "$_id"},
            "count": {"$sum": 1},
        }},
        {"$match": {"count": {"$gt": 1}}},
    ]
    duplicates = list(collection.aggregate(pipeline))
    if not duplicates:
        print("Cleanup: no duplicates found.")
        return 0

    ids_to_delete = []
    for group in duplicates:
        extras = [oid for oid in group["allIds"] if oid != group["keepId"]]
        ids_to_delete.extend(extras)
        print(f"  Duplicate: sourceAvatarId={group['_id']['sourceAvatarId']} "
              f"emotion={group['_id']['emotion']} keeping={group['keepId']} "
              f"deleting {len(extras)}")

    result = collection.delete_many({"_id": {"$in": ids_to_delete}})
    print(f"Cleanup: deleted {result.deleted_count} duplicate docs.\n")
    return result.deleted_count


# ---------------------------------------------------------------------------
# Mongo benchmark
# ---------------------------------------------------------------------------

def mongo_query(collection, avatar_id: str, include_full: bool) -> dict:
    filter_doc = {
        "sourceAvatarId": avatar_id,
        "imageType": "emotion_generated",
        "emotion": {"$in": EMOTIONS},
    }
    projection = {
        "_id": 1, "emotion": 1, "createdAt": 1,
        "thumbnailData": 1, "thumbnailContentType": 1,
    }
    if include_full:
        projection["imageData"] = 1
        projection["contentType"] = 1

    start = time.perf_counter()
    items = list(collection.find(filter_doc, projection=projection).sort("createdAt", DESCENDING))
    elapsed_ms = (time.perf_counter() - start) * 1000

    full_bytes = sum(len(item.get("imageData", b"")) for item in items) if include_full else 0
    return {"count": len(items), "elapsed_ms": round(elapsed_ms, 1), "full_bytes": full_bytes}


def bench_mongo(collection, original_ids: list[str]) -> list[dict]:
    rows = []
    for avatar_id in original_ids:
        thumb = mongo_query(collection, avatar_id, include_full=False)
        full = mongo_query(collection, avatar_id, include_full=True)
        rows.append({
            "avatarId": avatar_id,
            "mongo_thumb_count": thumb["count"],
            "mongo_thumb_ms": thumb["elapsed_ms"],
            "mongo_full_count": full["count"],
            "mongo_full_ms": full["elapsed_ms"],
            "mongo_full_bytes": full["full_bytes"],
        })
        status = f"count={full['count']} fullBytes={full['full_bytes']}"
        print(f"  Mongo {avatar_id}  thumb={thumb['elapsed_ms']}ms  full={full['elapsed_ms']}ms  {status}")
    return rows


# ---------------------------------------------------------------------------
# API benchmark
# ---------------------------------------------------------------------------

def api_login(api_url: str, username: str, password: str) -> str:
    resp = requests.post(
        f"{api_url}/api/auth/login",
        json={"email": username, "password": password},
        timeout=15,
    )
    resp.raise_for_status()
    token = resp.json().get("accessToken")
    if not token:
        raise ValueError(f"No accessToken in login response: {resp.text}")
    return token


def api_query(api_url: str, token: str, avatar_id: str, include_full: bool) -> dict:
    params = {"includeFull": "true"} if include_full else {}
    headers = {"Authorization": f"Bearer {token}"}

    start = time.perf_counter()
    resp = requests.get(
        f"{api_url}/api/avatar/emotion-thumbnails/{avatar_id}",
        params=params,
        headers=headers,
        timeout=30,
    )
    elapsed_ms = (time.perf_counter() - start) * 1000

    if resp.status_code != 200:
        return {"count": -1, "elapsed_ms": round(elapsed_ms, 1), "error": resp.status_code}

    data = resp.json()
    count = data.get("count", len(data.get("results", [])))
    return {"count": count, "elapsed_ms": round(elapsed_ms, 1)}


def bench_api(api_url: str, token: str, original_ids: list[str]) -> list[dict]:
    rows = []
    for avatar_id in original_ids:
        thumb = api_query(api_url, token, avatar_id, include_full=False)
        full = api_query(api_url, token, avatar_id, include_full=True)
        rows.append({
            "avatarId": avatar_id,
            "api_thumb_ms": thumb["elapsed_ms"],
            "api_full_ms": full["elapsed_ms"],
            "api_thumb_count": thumb["count"],
            "api_full_count": full["count"],
        })
        print(f"  API   {avatar_id}  thumb={thumb['elapsed_ms']}ms  full={full['elapsed_ms']}ms")
    return rows


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

def print_table(mongo_rows: list[dict], api_rows: list[dict]) -> None:
    api_by_id = {r["avatarId"]: r for r in api_rows}

    has_api = bool(api_rows)
    header_cols = ["avatarId(short)", "gen?", "mongo_thumb_ms", "mongo_full_ms", "bytes_MB"]
    if has_api:
        header_cols += ["api_thumb_ms", "api_full_ms", "delta_full_ms"]

    col_w = [18, 5, 15, 14, 9]
    if has_api:
        col_w += [13, 12, 13]

    def row_str(cols):
        return "  ".join(str(c).ljust(w) for c, w in zip(cols, col_w))

    print("\n" + "=" * 100)
    print(row_str(header_cols))
    print("-" * 100)

    mongo_thumb_times = []
    mongo_full_times = []
    api_full_times = []

    for mr in mongo_rows:
        aid = mr["avatarId"]
        short_id = aid[-12:]
        has_gen = mr["mongo_full_count"] > 0
        mb = f"{mr['mongo_full_bytes'] / 1_000_000:.2f}" if mr["mongo_full_bytes"] else "-"

        mongo_thumb_times.append(mr["mongo_thumb_ms"])
        if has_gen:
            mongo_full_times.append(mr["mongo_full_ms"])

        cols = [short_id, "YES" if has_gen else "no", mr["mongo_thumb_ms"], mr["mongo_full_ms"], mb]

        if has_api and aid in api_by_id:
            ar = api_by_id[aid]
            delta = round(ar["api_full_ms"] - mr["mongo_full_ms"], 1)
            cols += [ar["api_thumb_ms"], ar["api_full_ms"], f"+{delta}" if delta >= 0 else str(delta)]
            if has_gen:
                api_full_times.append(ar["api_full_ms"])

        print(row_str(cols))

    print("=" * 100)
    gen_mongo = [(r["avatarId"], r["mongo_full_ms"], r["mongo_full_bytes"]) for r in mongo_rows if r["mongo_full_count"] > 0]
    print(f"\n  Generated avatars ({len(gen_mongo)}):")
    for aid, ms, b in gen_mongo:
        api_ms = api_by_id[aid]["api_full_ms"] if has_api and aid in api_by_id else None
        api_str = f"  api_full={api_ms}ms  delta={round(api_ms - ms, 1):+.1f}ms" if api_ms is not None else ""
        print(f"    {aid}  mongo_full={ms}ms  {b/1_000_000:.2f}MB{api_str}")
    if mongo_full_times:
        print(f"\n  Mongo full avg={round(sum(mongo_full_times)/len(mongo_full_times),1)}ms  "
              f"min={min(mongo_full_times)}ms  max={max(mongo_full_times)}ms")
    if has_api and api_full_times:
        print(f"  API   full avg={round(sum(api_full_times)/len(api_full_times),1)}ms  "
              f"min={min(api_full_times)}ms  max={max(api_full_times)}ms")
    print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Cleanup duplicates + benchmark avatar queries")
    parser.add_argument("--api-url", default="http://localhost:5001", help="API base URL")
    parser.add_argument("--login", nargs=2, metavar=("EMAIL", "PASSWORD"), help="Login and benchmark API")
    parser.add_argument("--api-token", help="Supply JWT token directly for API benchmark")
    parser.add_argument("--skip-cleanup", action="store_true", help="Skip duplicate cleanup step")
    args = parser.parse_args()

    settings = load_settings()
    mongo_cfg = settings["MongoDB"]
    client = MongoClient(mongo_cfg["ConnectionString"])
    db = client[mongo_cfg["DatabaseName"]]
    collection = db["avatarImages"]

    # Step 1: Cleanup
    if not args.skip_cleanup:
        print("=== Step 1: Cleanup duplicate emotion_generated docs ===")
        cleanup_duplicates(collection)

    # Step 2: Collect all original avatar IDs
    print("=== Step 2: Collecting all original avatars ===")
    originals = list(collection.find(
        {"imageType": "original", "emotion": None, "sourceAvatarId": None},
        {"_id": 1}
    ).sort("createdAt", DESCENDING))
    original_ids = [str(doc["_id"]) for doc in originals]
    print(f"  Found {len(original_ids)} original avatars.\n")

    # Step 3: Mongo benchmark
    print("=== Step 3: Mongo benchmark ===")
    mongo_rows = bench_mongo(collection, original_ids)

    # Step 4: API benchmark (optional)
    api_rows = []
    token = args.api_token
    if args.login and not token:
        print(f"\n=== Step 4: API login & benchmark ({args.api_url}) ===")
        try:
            token = api_login(args.api_url, args.login[0], args.login[1])
            print(f"  Logged in OK.\n")
        except Exception as e:
            print(f"  Login failed: {e}\n")

    if token:
        print(f"=== Step 4: API benchmark ({args.api_url}) ===")
        api_rows = bench_api(args.api_url, token, original_ids)

    # Step 5: Table
    print_table(mongo_rows, api_rows)


if __name__ == "__main__":
    main()
