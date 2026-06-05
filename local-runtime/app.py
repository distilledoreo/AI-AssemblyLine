from __future__ import annotations

import base64
import io
import os
import uuid
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from PIL import Image
from pydantic import BaseModel


TEXT_MODEL = os.getenv("LOCAL_TEXT_MODEL", "qwen3.6-27b")
IMAGE_MODEL = os.getenv("LOCAL_IMAGE_MODEL", "qwen-image-2512")
VIDEO_MODEL = os.getenv("LOCAL_VIDEO_MODEL", "ltx-2.3")
PRESET = os.getenv("LOCAL_RUNTIME_PRESET", "auto")
MOCK = os.getenv("LOCAL_RUNTIME_MOCK", "1") == "1"

app = FastAPI(title="AI AssemblyLine Local Runtime")
video_results: dict[str, bytes] = {}


class TextRequest(BaseModel):
    prompt: str
    schema: dict[str, Any] | None = None
    modelId: str | None = None
    responseFormat: str = "json"
    maxTokens: int | None = None
    temperature: float | None = None


class ImageRequest(BaseModel):
    prompt: str
    negativePrompt: str | None = None
    modelId: str | None = None
    width: int = 1024
    height: int = 576
    count: int = 1
    seed: int | None = None
    qualityMode: str | None = None


class VideoRequest(BaseModel):
    prompt: str
    negativePrompt: str | None = None
    modelId: str | None = None
    width: int = 1024
    height: int = 576
    durationSeconds: int = 3
    seed: int | None = None
    startImageB64: str | None = None
    endImageB64: str | None = None


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "mock": MOCK,
        "preset": PRESET,
        "models": {"text": TEXT_MODEL, "image": IMAGE_MODEL, "video": VIDEO_MODEL},
    }


@app.post("/v1/text")
def text(request: TextRequest) -> dict[str, Any]:
    if not MOCK:
        raise HTTPException(status_code=501, detail="Model backend is not installed in this lightweight gateway yet.")
    content = _mock_structured_script_analysis(request.prompt)
    return {
        "id": f"local-text-{uuid.uuid4()}",
        "modelId": request.modelId or TEXT_MODEL,
        "content": content,
        "usage": {"inputTokens": max(1, len(request.prompt) // 4), "outputTokens": max(1, len(content) // 4)},
    }


@app.post("/v1/image")
def image(request: ImageRequest) -> dict[str, Any]:
    if not MOCK:
        raise HTTPException(status_code=501, detail="Model backend is not installed in this lightweight gateway yet.")
    encoded = _png_base64(request.width, request.height)
    return {
        "modelId": request.modelId or IMAGE_MODEL,
        "images": [{"b64": encoded, "mimeType": "image/png"} for _ in range(max(1, min(request.count, 2)))],
    }


@app.post("/v1/video")
def video(request: VideoRequest) -> dict[str, Any]:
    if not MOCK:
        raise HTTPException(status_code=501, detail="Model backend is not installed in this lightweight gateway yet.")
    job_id = f"local-video-{uuid.uuid4()}"
    video_results[job_id] = _tiny_mp4_placeholder()
    return {"jobId": job_id, "isAsync": True, "modelId": request.modelId or VIDEO_MODEL}


@app.get("/v1/video/{job_id}")
def video_status(job_id: str) -> dict[str, Any]:
    if job_id not in video_results:
        raise HTTPException(status_code=404, detail="Video job not found.")
    return {"status": "complete", "progress": 100, "resultUrl": f"/v1/video/{job_id}/result"}


@app.get("/v1/video/{job_id}/result")
def video_result(job_id: str) -> Response:
    data = video_results.get(job_id)
    if not data:
        raise HTTPException(status_code=404, detail="Video result not found.")
    return Response(content=data, media_type="video/mp4")


def _mock_structured_script_analysis(prompt: str) -> str:
    if "shotBreakdowns" in prompt:
        return '{"shotBreakdowns":[{"sceneNumber":1,"shots":[{"shotNumber":1,"action":"A simple cinematic moment unfolds.","cameraAngle":"wide","cameraMovement":"slow push in","lensNotes":"natural perspective","lightingNotes":"soft light"}]}]}'
    if "sceneAssetLinks" in prompt:
        return '{"assets":[{"canonicalName":"Main Character","type":"character","aliases":["Main Character"],"description":"The story lead.","firstAppearance":{"sceneNumber":1,"shotNumber":1}}],"sceneAssetLinks":[{"sceneNumber":1,"assetName":"Main Character"}],"shotAssetLinks":[{"sceneNumber":1,"shotNumber":1,"assetName":"Main Character"}],"warnings":[]}'
    return '{"scenes":[{"sceneNumber":1,"heading":"UNTITLED SCENE","summary":"A short film idea becomes a simple scene.","scriptStartLine":1,"scriptEndLine":3,"locationHint":"Studio"}]}'


def _png_base64(width: int, height: int) -> str:
    image = Image.new("RGB", (max(64, min(width, 1024)), max(64, min(height, 1024))), color=(39, 113, 128))
    output = io.BytesIO()
    image.save(output, format="PNG")
    return base64.b64encode(output.getvalue()).decode("ascii")


def _tiny_mp4_placeholder() -> bytes:
    # Minimal non-empty placeholder; production Colab backend replaces this with LTX output.
    return base64.b64decode(
        "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAABBtZGF0AAAAAA=="
    )
