from fastapi import FastAPI
from fastapi.responses import Response
from pydantic import BaseModel
from rembg import remove
from PIL import Image
from scipy.ndimage import gaussian_filter
import numpy as np
import base64
import io

app = FastAPI()


class ImageRequest(BaseModel):
    image_base64: str
    # "chroma"  — chroma key removal for pure #00FF00 green backgrounds (default for stickers)
    # "soft"    — rembg alpha matting, conservative (portraits on non-green backgrounds)
    # "normal"  — rembg alpha matting, balanced
    # "hard"    — rembg binary mask, fastest
    aggressiveness: str = "chroma"
    # Chroma key tolerance: how far from pure green a pixel can be and still be removed.
    # Lower = stricter (only pure green removed). Higher = more green shades removed.
    chroma_tolerance: int = 40
    # Radius for edge feathering after chroma key (softens the hard cutout edge).
    feather_radius: float = 1.5


def remove_chroma_green(
    image_bytes: bytes,
    tolerance: int = 40,
    feather_radius: float = 1.5,
) -> bytes:
    """
    Chroma key removal tuned for pure #00FF00 green backgrounds.

    Steps:
    1. Build a mask: pixels where green channel dominates both red and blue by `tolerance`.
    2. Dilate the mask slightly to catch compressed-edge artefacts.
    3. Feather the mask edges with a gaussian blur for smooth transparency falloff.
    4. Suppress green spill on semi-transparent edge pixels (reduce green channel
       where the pixel is partially keyed out).
    5. Return RGBA PNG.
    """
    img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    data = np.array(img, dtype=np.float32)

    r, g, b = data[:, :, 0], data[:, :, 1], data[:, :, 2]

    # Core chroma mask: green dominates both channels by `tolerance`
    green_dominance = np.minimum(g - r, g - b)
    # Soft mask: 0 = fully keep, 1 = fully remove
    # Pixels above tolerance are removed; pixels in [0, tolerance] get partial alpha
    raw_mask = np.clip(green_dominance / max(tolerance, 1), 0, 1)

    # Feather edges with gaussian blur so the cutout isn't a hard staircase
    if feather_radius > 0:
        feathered_mask = gaussian_filter(raw_mask, sigma=feather_radius)
        # Re-sharpen slightly — gaussian can soften too much in the core green area
        feathered_mask = np.clip(feathered_mask * 1.2, 0, 1)
    else:
        feathered_mask = raw_mask

    # Apply alpha: existing alpha * (1 - green_mask)
    existing_alpha = data[:, :, 3] / 255.0
    new_alpha = existing_alpha * (1.0 - feathered_mask)
    data[:, :, 3] = np.clip(new_alpha * 255, 0, 255)

    # Green spill suppression on edge pixels:
    # Where the pixel is being partially keyed (semi-transparent), the green channel
    # often has bleed from the background. Clamp it to the max of red and blue channels.
    spill_region = (feathered_mask > 0.05) & (feathered_mask < 0.95)
    max_rb = np.maximum(r, b)
    data[:, :, 1] = np.where(spill_region, np.minimum(g, max_rb * 1.1), g)

    result = Image.fromarray(data.astype(np.uint8), "RGBA")
    buf = io.BytesIO()
    result.save(buf, format="PNG")
    return buf.getvalue()


@app.post("/internal/remove-background")
async def remove_background(request: ImageRequest):
    image_bytes = base64.b64decode(request.image_base64)

    if request.aggressiveness == "chroma":
        output_bytes = remove_chroma_green(
            image_bytes,
            tolerance=request.chroma_tolerance,
            feather_radius=request.feather_radius,
        )
    elif request.aggressiveness == "soft":
        output_bytes = remove(
            image_bytes,
            alpha_matting=True,
            alpha_matting_foreground_threshold=220,
            alpha_matting_background_threshold=25,
            alpha_matting_erode_size=5,
        )
    elif request.aggressiveness == "hard":
        output_bytes = remove(image_bytes, alpha_matting=False)
    else:
        # "normal" — rembg alpha matting with relaxed thresholds
        output_bytes = remove(
            image_bytes,
            alpha_matting=True,
            alpha_matting_foreground_threshold=230,
            alpha_matting_background_threshold=20,
            alpha_matting_erode_size=7,
        )

    return Response(content=output_bytes, media_type="image/png")


@app.get("/health")
async def health():
    return {"status": "ok"}
