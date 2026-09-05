#!/usr/bin/env python3
"""Generate the toolbar icons.

Kept as a script rather than committing only the binaries so the artwork can be
regenerated at any size without a design tool. The mark is a purple rounded
square with a white "no entry" bar across a pixelated block — a blocked
generated image.
"""
import struct, zlib, os

BG_A = (124, 58, 237)    # violet-600
BG_B = (167, 82, 247)
FG = (255, 255, 255)


def rounded(x, y, size, radius):
    """True when (x, y) is inside a rounded square of the given size."""
    cx = min(max(x, radius), size - radius)
    cy = min(max(y, radius), size - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2


def render(size):
    radius = max(2, size // 5)
    pixels = []
    # Diagonal bar of the "no" symbol, in normalised coordinates.
    half = size * 0.085
    for y in range(size):
        row = bytearray()
        for x in range(size):
            if not rounded(x + 0.5, y + 0.5, size, radius):
                row += bytes((0, 0, 0, 0))
                continue
            t = (x + y) / (2 * size)
            bg = tuple(int(a + (b - a) * t) for a, b in zip(BG_A, BG_B))

            # Pixel-grid motif: a 3x3 block of "image" squares in the middle.
            cell = size / 8.0
            gx, gy = int(x / cell), int(y / cell)
            in_grid = 2 <= gx <= 5 and 2 <= gy <= 5
            checker = in_grid and (gx + gy) % 2 == 0
            colour = tuple(min(255, c + 55) for c in bg) if checker else bg

            # The strike-through bar, drawn on top.
            d = abs((x - y)) / (2 ** 0.5)
            if d <= half:
                colour = FG
            row += bytes(colour + (255,))
        pixels.append(bytes(row))
    return pixels


def write_png(path, size):
    rows = render(size)
    raw = b"".join(b"\x00" + row for row in rows)

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    with open(path, "wb") as fh:
        fh.write(png)
    return len(png)


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(__file__), "..", "icons")
    os.makedirs(out, exist_ok=True)
    for size in (16, 32, 48, 128):
        path = os.path.join(out, f"icon-{size}.png")
        print(f"icon-{size}.png  {write_png(path, size)} bytes")
