import argparse
import base64
import json
import sys
import urllib.parse
import unicodedata
from pathlib import Path


OLD_PREFIX = "J31mEo"
NEW_PREFIX = "J31mEo2:"


def read_text(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write_text(path: str, content: str) -> None:
    Path(path).write_text(content, encoding="utf-8")


def normalize_name(name: str) -> str:
    return unicodedata.normalize("NFC", str(name))


def old_decrypt(save_text: str) -> str:
    if not save_text.startswith(OLD_PREFIX):
        raise ValueError("不是旧格式存档，旧格式前缀应为 J31mEo")

    payload = save_text[len(OLD_PREFIX):]
    decoded = urllib.parse.unquote(payload)
    chars = []

    for ch in decoded:
        num = ord(ch) // 2
        chars.append(chr(num))

    return "".join(chars)


def new_encrypt(json_text: str) -> str:
    utf8_bytes = json_text.encode("utf-8")
    b64 = base64.b64encode(utf8_bytes).decode("ascii")
    return NEW_PREFIX + b64


def new_decrypt(save_text: str) -> str:
    if not save_text.startswith(NEW_PREFIX):
        raise ValueError("不是新格式存档，新格式前缀应为 J31mEo2:")

    payload = save_text[len(NEW_PREFIX):]
    raw = base64.b64decode(payload.encode("ascii"))
    return raw.decode("utf-8")


def auto_decrypt(save_text: str) -> str:
    if save_text.startswith(NEW_PREFIX):
        return new_decrypt(save_text)
    if save_text.startswith(OLD_PREFIX):
        return old_decrypt(save_text)
    raise ValueError("无法识别存档格式：既不是旧格式 J31mEo，也不是新格式 J31mEo2:")


def load_json_from_save(path: str) -> dict:
    save_text = read_text(path).strip()
    json_text = auto_decrypt(save_text)
    try:
        return json.loads(json_text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"解密成功，但 JSON 解析失败：{exc}") from exc


def dump_json(path: str, data: dict) -> None:
    text = json.dumps(data, ensure_ascii=False, indent=2)
    write_text(path, text)


def load_json_file(path: str) -> dict:
    text = read_text(path)
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"JSON 文件解析失败：{exc}") from exc


def get_charname(data: dict):
    if isinstance(data, dict):
        if "vars" in data and isinstance(data["vars"], dict) and "charname" in data["vars"]:
            return data["vars"]["charname"]
        if "charname" in data:
            return data["charname"]
    return None


def set_charname(data: dict, new_name: str, normalize: bool) -> dict:
    fixed_name = normalize_name(new_name) if normalize else str(new_name)

    if not isinstance(data, dict):
        raise ValueError("存档 JSON 顶层不是对象，无法设置 charname")

    # 优先修正真实游戏存档结构：vars.charname
    if "vars" in data and isinstance(data["vars"], dict):
        data["vars"]["charname"] = fixed_name
    else:
        data["vars"] = {"charname": fixed_name}

    # 同时兼容某些工具或旧脚本使用的顶层 charname
    if "charname" in data:
        data["charname"] = fixed_name

    return data


def command_decrypt(args: argparse.Namespace) -> int:
    data = load_json_from_save(args.input)
    dump_json(args.output, data)

    current_name = get_charname(data)
    print(f"已解密为 JSON：{args.output}")
    print(f"当前主角名：{current_name}")
    return 0


def command_encrypt(args: argparse.Namespace) -> int:
    data = load_json_file(args.input)
    json_text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    save_text = new_encrypt(json_text)
    write_text(args.output, save_text)
    print(f"已按新格式加密：{args.output}")
    return 0


def command_repair_name(args: argparse.Namespace) -> int:
    data = load_json_from_save(args.input)

    old_name = get_charname(data)
    print(f"修复前主角名：{old_name}")

    data = set_charname(data, args.name, args.normalize)

    new_name = get_charname(data)
    print(f"修复后主角名：{new_name}")

    if args.json_output:
        dump_json(args.json_output, data)
        print(f"已导出修复后的 JSON：{args.json_output}")

    json_text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    save_text = new_encrypt(json_text)
    write_text(args.output, save_text)
    print(f"已生成修复后的新格式存档：{args.output}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="修复 VN 存档：解密旧存档为 JSON，或将 JSON 按新格式重新加密。"
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    parser_decrypt = subparsers.add_parser(
        "decrypt",
        help="解密旧/新存档为 JSON 文件"
    )
    parser_decrypt.add_argument("input", help="输入存档文件路径")
    parser_decrypt.add_argument("output", help="输出 JSON 文件路径")
    parser_decrypt.set_defaults(func=command_decrypt)

    parser_encrypt = subparsers.add_parser(
        "encrypt",
        help="将 JSON 文件按新格式加密为存档"
    )
    parser_encrypt.add_argument("input", help="输入 JSON 文件路径")
    parser_encrypt.add_argument("output", help="输出新格式存档路径")
    parser_encrypt.set_defaults(func=command_encrypt)

    parser_repair = subparsers.add_parser(
        "repair-name",
        help="读取旧/新存档，修复主角名，并输出为新格式存档"
    )
    parser_repair.add_argument("input", help="输入旧/新存档路径")
    parser_repair.add_argument("output", help="输出新格式存档路径")
    parser_repair.add_argument("--name", required=True, help="新的主角名，例如：姜酒")
    parser_repair.add_argument("--json-output", help="可选：同时导出修复后的 JSON 路径")
    parser_repair.add_argument(
        "--normalize",
        action="store_true",
        help="对主角名做 NFC 规范化"
    )
    parser_repair.set_defaults(func=command_repair_name)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    try:
        return args.func(args)
    except Exception as exc:
        print(f"错误：{exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())