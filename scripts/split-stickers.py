"""
Split a sticker grid image into 4 quadrants, remove background, save as 512x512 webp.

Usage:
  python split-stickers.py <input_image_path> <output_directory>

Outputs:
  <output_directory>/sticker_1.webp
  <output_directory>/sticker_2.webp
  <output_directory>/sticker_3.webp
  <output_directory>/sticker_4.webp

Exits 0 on success, prints JSON array of output paths to stdout.
"""

import sys
import os
import io
import json
from PIL import Image
from rembg import remove


def process_sticker(pil_image: Image.Image) -> Image.Image:
    buf = io.BytesIO()
    pil_image.save(buf, format="PNG")
    result = remove(buf.getvalue())
    return Image.open(io.BytesIO(result)).convert("RGBA")


def main():
    if len(sys.argv) != 3:
        print("Usage: split-stickers.py <input_image> <output_dir>", file=sys.stderr)
        sys.exit(1)

    input_path = sys.argv[1]
    output_dir = sys.argv[2]

    if not os.path.isfile(input_path):
        print(f"Input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(output_dir, exist_ok=True)

    img = Image.open(input_path).convert("RGBA")
    w, h = img.size

    quads = [
        img.crop((0, 0, w // 2, h // 2)),
        img.crop((w // 2, 0, w, h // 2)),
        img.crop((0, h // 2, w // 2, h)),
        img.crop((w // 2, h // 2, w, h)),
    ]

    output_paths = []
    for i, quad in enumerate(quads, start=1):
        processed = process_sticker(quad)
        resized = processed.resize((512, 512), Image.LANCZOS)
        out_path = os.path.join(output_dir, f"sticker_{i}.webp")
        resized.save(out_path, format="WEBP", quality=90)
        output_paths.append(out_path)

    print(json.dumps(output_paths))


if __name__ == "__main__":
    main()
