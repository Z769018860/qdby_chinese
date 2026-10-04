"""Fetch and decode a Morimens BattleReplay object using only its UUID.

Sends one anonymous HTTPS GET. No game login, cookies, authorization headers,
packet capture, or client memory access are used.
"""

from __future__ import annotations

import argparse
import base64
import json
import re
from pathlib import Path
from urllib.request import Request, urlopen

import lz4.frame
import msgpack


UUID = re.compile(r"^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$")
BASE = "https://z1g-warreport.qookkagames.com/publish/BattleReplay_{}.json"


def jsonable(value):
    if isinstance(value, bytes):
        try:
            return value.decode("utf-8")
        except UnicodeDecodeError:
            return {"$binaryBase64": base64.b64encode(value).decode("ascii")}
    if isinstance(value, dict):
        return {str(jsonable(key)): jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [jsonable(item) for item in value]
    return value


def unpack_lz4_msgpack(data):
    if not data.startswith(b"\x04\x22\x4d\x18"):
        raise ValueError("Expected LZ4 frame")
    return msgpack.unpackb(lz4.frame.decompress(data), raw=True, strict_map_key=False)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("replay_code", help="UUID or UUID#E#a")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    uuid = args.replay_code.split("#", 1)[0].lower()
    if not UUID.fullmatch(uuid):
        raise SystemExit("Invalid replay UUID")
    url = BASE.format(uuid)
    request = Request(url, method="GET")
    with urlopen(request, timeout=30) as response:
        body = response.read(20_000_001)
        if len(body) > 20_000_000:
            raise ValueError("Replay object exceeds 20 MB limit")
    envelope = json.loads(body.decode("latin1"))
    packed = envelope["compStr"].encode("latin1")
    root = unpack_lz4_msgpack(packed)
    if not isinstance(root, dict) or b"recordZips" not in root:
        raise ValueError("Unexpected replay structure")
    segments = [unpack_lz4_msgpack(blob) for blob in root[b"recordZips"]]
    result = {
        "replayUuid": uuid,
        "sourceUrl": url,
        "access": "anonymous HTTPS GET",
        "format": "JSON-like compStr -> LZ4 frame -> MessagePack; recordZips -> LZ4 frame -> MessagePack",
        "battleDat": jsonable(root.get(b"battleDat")),
        "resourceRecords": jsonable(root.get(b"resourceRecords")),
        "recordSegments": jsonable(segments),
        "recordCount": sum(len(segment) for segment in segments),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print("DECODED", args.output, "segments", len(segments), "records", result["recordCount"])


if __name__ == "__main__":
    main()
