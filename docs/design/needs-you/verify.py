import struct
from pathlib import Path


def main():
    directory = Path(__file__).resolve().parent
    for filename, expected_width in (("needs-you-390.png", 390), ("needs-you-1440.png", 1440)):
        image = directory / filename
        if not image.is_file():
            raise SystemExit(f"{filename}: expected a PNG {expected_width} px wide, but the target is missing")
        with image.open("rb") as source:
            header = source.read(24)
        if len(header) != 24 or header[:16] != b"\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR":
            raise SystemExit(f"{filename}: invalid PNG header")
        width, height = struct.unpack(">II", header[16:])
        if width != expected_width or height == 0:
            raise SystemExit(f"{filename}: expected {expected_width} px wide, got {width} × {height} px")
        print(f"{filename}: {width} × {height} px")


if __name__ == "__main__":
    main()
