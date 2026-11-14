import numpy as np


class ExportPicture:
    def __init__(self, width, height):
        self.rgb = np.empty((height, width, 4), dtype=np.uint8)
        self.buffer = bytearray(width * height * 3 // 2)
        plane = np.frombuffer(self.buffer, dtype=np.uint8)
        pixels = width * height
        self.y = plane[:pixels].reshape(height, width)
        self.u = plane[pixels:pixels + pixels // 4].reshape(height // 2, width // 2)
        self.v = plane[pixels + pixels // 4:].reshape(height // 2, width // 2)

    def update(self, data, box):
        x, y, width, height = box
        right, bottom = x + width, y + height
        self.rgb[y:bottom, x:right] = np.frombuffer(data, dtype=np.uint8).reshape(height, width, 4)
        left, top = x & ~1, y & ~1
        right, bottom = (right + 1) & ~1, (bottom + 1) & ~1
        r, g, b = self.rgb[top:bottom, left:right, :3].astype(np.int32).transpose(2, 0, 1)
        self.y[top:bottom, left:right] = ((66 * r + 129 * g + 25 * b + 128) >> 8) + 16
        chroma = np.s_[top // 2:bottom // 2, left // 2:right // 2]
        shape = ((bottom - top) // 2, 2, (right - left) // 2, 2)
        u = (-38 * r - 74 * g + 112 * b).reshape(shape).sum(axis=(1, 3), dtype=np.int32)
        v = (112 * r - 94 * g - 18 * b).reshape(shape).sum(axis=(1, 3), dtype=np.int32)
        self.u[chroma] = ((u + 512) >> 10) + 128
        self.v[chroma] = ((v + 512) >> 10) + 128
        return self.buffer
