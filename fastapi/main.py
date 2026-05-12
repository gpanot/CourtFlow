from fastapi import FastAPI
from fastapi.responses import Response
from pydantic import BaseModel
from rembg import remove, new_session
import base64

app = FastAPI()

# Create session once at startup — avoids reloading the model on every request
session = new_session("birefnet-general")


class ImageRequest(BaseModel):
    image_base64: str


@app.post("/internal/remove-background")
async def remove_background(request: ImageRequest):
    image_bytes = base64.b64decode(request.image_base64)
    output_bytes = remove(
        image_bytes,
        session=session,
        alpha_matting=True,
        alpha_matting_foreground_threshold=240,
        alpha_matting_background_threshold=10,
        alpha_matting_erode_size=10,
    )
    return Response(content=output_bytes, media_type="image/png")


@app.get("/health")
async def health():
    return {"status": "ok"}
