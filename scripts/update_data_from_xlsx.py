#!/usr/bin/env python3
"""从“汉化汇总.xlsx”提取数据并更新 data.json。

功能：
1) 读取 Excel 首个工作表，按首行表头构建记录。
2) 解析 `游戏截图` 中的 `DISPIMG("ID_xxx",1)`，映射到 xlsx 内嵌图片。
3) 与 images/ 目录按二进制内容匹配；若不存在则自动落盘到 images/。
4) 自动把 Excel 序列日期转换为 YYYY-MM-DD（仅对“汉化发布时间”列）。
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import zipfile
from pathlib import Path
from typing import Dict, List, Optional
import xml.etree.ElementTree as ET

NS_MAIN = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
NS_CELLIMG = {
    "etc": "http://www.wps.cn/officeDocument/2017/etCustomData",
    "xdr": "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
}
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_NS = {"r": "http://schemas.openxmlformats.org/package/2006/relationships"}


def col_to_index(col: str) -> int:
    val = 0
    for ch in col:
        val = val * 26 + (ord(ch) - ord("A") + 1)
    return val


def load_shared_strings(zf: zipfile.ZipFile) -> List[str]:
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    out: List[str] = []
    for si in root.findall("s:si", NS_MAIN):
        texts = [t.text or "" for t in si.findall(".//s:t", NS_MAIN)]
        out.append("".join(texts))
    return out


def parse_sheet_rows(zf: zipfile.ZipFile, shared: List[str]) -> List[Dict[str, str]]:
    sheet = ET.fromstring(zf.read("xl/worksheets/sheet1.xml"))
    rows = sheet.findall(".//s:sheetData/s:row", NS_MAIN)

    parsed_rows: List[Dict[str, str]] = []
    for row in rows:
        values: Dict[str, str] = {}
        for c in row.findall("s:c", NS_MAIN):
            ref = c.attrib["r"]
            col = re.match(r"[A-Z]+", ref).group(0)
            t = c.attrib.get("t")
            f = c.find("s:f", NS_MAIN)
            v = c.find("s:v", NS_MAIN)

            if f is not None:
                values[col] = "=" + (f.text or "")
            elif v is not None:
                raw = v.text or ""
                values[col] = shared[int(raw)] if t == "s" else raw
            else:
                values[col] = ""

        if values:
            parsed_rows.append(values)

    if not parsed_rows:
        return []

    header_row = parsed_rows[0]
    headers = {
        col_to_index(col): name for col, name in header_row.items() if name is not None and str(name).strip()
    }

    result: List[Dict[str, str]] = []
    for row_vals in parsed_rows[1:]:
        row_obj: Dict[str, str] = {}
        for col, val in row_vals.items():
            idx = col_to_index(col)
            header = headers.get(idx)
            if header:
                row_obj[header] = val
        if any(str(v).strip() for v in row_obj.values()):
            result.append(row_obj)
    return result


def excel_serial_to_date(text: str) -> str:
    if not re.fullmatch(r"\d+(\.\d+)?", str(text).strip()):
        return text
    serial = float(text)
    day = dt.datetime(1899, 12, 30) + dt.timedelta(days=serial)
    return day.strftime("%Y-%m-%d")


def load_cellimage_mapping(zf: zipfile.ZipFile) -> Dict[str, bytes]:
    if "xl/cellimages.xml" not in zf.namelist():
        return {}

    rels = ET.fromstring(zf.read("xl/_rels/cellimages.xml.rels"))
    rid_to_target = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in rels.findall("r:Relationship", PKG_NS)
    }

    cellimgs = ET.fromstring(zf.read("xl/cellimages.xml"))
    image_map: Dict[str, bytes] = {}

    for pic in cellimgs.findall("etc:cellImage/xdr:pic", NS_CELLIMG):
        cnvpr = pic.find("xdr:nvPicPr/xdr:cNvPr", NS_CELLIMG)
        blip = pic.find("xdr:blipFill/a:blip", NS_CELLIMG)
        if cnvpr is None or blip is None:
            continue
        disp_id = cnvpr.attrib.get("name")
        rid = blip.attrib.get(f"{{{REL_NS}}}embed")
        target = rid_to_target.get(rid or "")
        if not disp_id or not target:
            continue
        image_map[disp_id] = zf.read("xl/" + target)

    return image_map


def find_or_write_image(img_bytes: bytes, images_dir: Path, dispimg_id: str) -> Path:
    images_dir.mkdir(parents=True, exist_ok=True)
    for existing in images_dir.iterdir():
        if existing.is_file() and existing.read_bytes() == img_bytes:
            return existing

    ext = ".png"
    if img_bytes.startswith(b"\xff\xd8\xff"):
        ext = ".jpg"

    filename = dispimg_id.replace("ID_", "").lower()[:16] + ext
    out = images_dir / filename
    out.write_bytes(img_bytes)
    return out


def enrich_images(rows: List[Dict[str, str]], image_map: Dict[str, bytes], images_dir: Path) -> None:
    patt = re.compile(r'ID_[A-F0-9]+')
    for row in rows:
        formula = str(row.get("游戏截图", ""))
        m = patt.search(formula)
        if not m:
            continue
        disp_id = m.group(0)
        blob = image_map.get(disp_id)
        if not blob:
            continue
        img_path = find_or_write_image(blob, images_dir, disp_id)
        row["__id"] = img_path.stem
        row["__image"] = f"images/{img_path.name}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--xlsx", default="汉化汇总.xlsx")
    parser.add_argument("--data", default="data.json")
    parser.add_argument("--images-dir", default="images")
    args = parser.parse_args()

    xlsx = Path(args.xlsx)
    data_json = Path(args.data)
    images_dir = Path(args.images_dir)

    with zipfile.ZipFile(xlsx) as zf:
        shared = load_shared_strings(zf)
        rows = parse_sheet_rows(zf, shared)
        image_map = load_cellimage_mapping(zf)

    for row in rows:
        if "汉化发布时间" in row:
            row["汉化发布时间"] = excel_serial_to_date(str(row["汉化发布时间"]))

    enrich_images(rows, image_map, images_dir)

    data_json.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"已更新 {data_json}，共 {len(rows)} 条记录。")


if __name__ == "__main__":
    main()
