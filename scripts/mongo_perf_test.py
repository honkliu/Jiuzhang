import json
import sys
import time
from pathlib import Path

from pymongo import MongoClient

EMOTIONS = [
    "angry",
    "smile",
    "sad",
    "happy",
    "crying",
    "thinking",
    "surprised",
    "neutral",
    "excited",
]


def load_settings() -> dict:
    settings_path = Path(__file__).resolve().parents[1] / "KanKan" / "server" / "appsettings.json"
    with settings_path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def run_query(collection, avatar_id: str, include_full: bool) -> dict:
    filter_doc = {
        "sourceAvatarId": avatar_id,
        "imageType": "emotion_generated",
        "emotion": {"$in": EMOTIONS},
    }

    projection = {
        "_id": 1,
        "emotion": 1,
        "createdAt": 1,
        "thumbnailData": 1,
        "thumbnailContentType": 1,
    }

    if include_full:
        projection["imageData"] = 1
        projection["contentType"] = 1

    start = time.perf_counter()
    cursor = collection.find(filter_doc, projection=projection).sort("createdAt", -1)
    items = list(cursor)
    elapsed = time.perf_counter() - start

    total_full_bytes = 0
    if include_full:
        total_full_bytes = sum(len(item.get("imageData", b"")) for item in items)

    return {
        "count": len(items),
        "elapsed_ms": round(elapsed * 1000, 2),
        "full_bytes": total_full_bytes,
    }


def main() -> int:
    avatar_id = sys.argv[1] if len(sys.argv) > 1 else "699765f8091057dcb6fa32aa"
    settings = load_settings()
    mongo_cfg = settings.get("MongoDB", {})
    conn_str = mongo_cfg.get("ConnectionString")
    db_name = mongo_cfg.get("DatabaseName")

    if not conn_str or not db_name:
        print("Missing MongoDB settings in appsettings.json")
        return 1

    client = MongoClient(conn_str)
    db = client[db_name]
    collection = db["avatarImages"]

    print(f"AvatarId: {avatar_id}")

    thumb = run_query(collection, avatar_id, include_full=False)
    print(f"Thumbnails: count={thumb['count']} elapsedMs={thumb['elapsed_ms']}")

    full = run_query(collection, avatar_id, include_full=True)
    print(
        "Full: count={count} elapsedMs={elapsed_ms} fullBytes={full_bytes}".format(
            count=full["count"],
            elapsed_ms=full["elapsed_ms"],
            full_bytes=full["full_bytes"],
        )
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
