from fastapi import FastAPI
from fastapi.responses import Response
from pydantic import BaseModel
from rembg import remove
import base64

app = FastAPI()


class ImageRequest(BaseModel):
    image_base64: str


@app.post("/internal/remove-background")
async def remove_background(request: ImageRequest):
    image_bytes = base64.b64decode(request.image_base64)
    output_bytes = remove(image_bytes)
    return Response(content=output_bytes, media_type="image/png")


@app.get("/health")
async def health():
    return {"status": "ok"}
