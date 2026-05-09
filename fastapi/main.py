from fastapi import FastAPI, UploadFile, File
from fastapi.responses import Response
from rembg import remove

app = FastAPI()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/internal/remove-background")
async def remove_background(file: UploadFile = File(...)):
    input_bytes = await file.read()
    output_bytes = remove(input_bytes)
    return Response(content=output_bytes, media_type="image/png")
