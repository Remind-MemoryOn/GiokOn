from __future__ import annotations

import re
import struct
import sys
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).with_name("hwp-deps")))
import OleFileIO_PL as olefile  # type: ignore

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


PARA_TEXT_TAG = 67


def clean_text(value: str) -> str:
    value = value.replace("\r", "\n")
    value = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", value)
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r" *\n *", "\n", value)
    return value.strip()


def extract(path: Path) -> str:
    if not olefile.isOleFile(path):
        raise ValueError(f"OLE HWP 파일이 아닙니다: {path}")
    with olefile.OleFileIO(path) as ole:
        flags = struct.unpack("<I", ole.openstream("FileHeader").read()[36:40])[0]
        compressed = bool(flags & 1)
        sections = sorted(
            (entry for entry in ole.listdir() if len(entry) == 2 and entry[0] == "BodyText"),
            key=lambda entry: int(entry[1].replace("Section", "")),
        )
        paragraphs: list[str] = []
        for entry in sections:
            data = ole.openstream(entry).read()
            if compressed:
                data = zlib.decompress(data, -15)
            offset = 0
            while offset + 4 <= len(data):
                header = struct.unpack("<I", data[offset : offset + 4])[0]
                offset += 4
                tag_id = header & 0x3FF
                size = (header >> 20) & 0xFFF
                if size == 0xFFF:
                    if offset + 4 > len(data):
                        break
                    size = struct.unpack("<I", data[offset : offset + 4])[0]
                    offset += 4
                payload = data[offset : offset + size]
                offset += size
                if tag_id != PARA_TEXT_TAG or not payload:
                    continue
                text = clean_text(payload.decode("utf-16le", errors="ignore"))
                if text:
                    paragraphs.append(text)
        return "\n".join(paragraphs)


def main() -> None:
    for raw in sys.argv[1:]:
        path = Path(raw)
        print(f"\n===== {path.name} =====")
        print(extract(path))


if __name__ == "__main__":
    main()
