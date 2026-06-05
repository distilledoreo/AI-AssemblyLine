from __future__ import annotations

import base64
import gc
import io
import json
import math
import os
import tempfile
import uuid
from dataclasses import dataclass
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from PIL import Image
from pydantic import BaseModel, ConfigDict, Field


DEFAULT_TEXT_MODEL = "Qwen/Qwen3.6-27B"
DEFAULT_IMAGE_MODEL = "Qwen/Qwen-Image-2512"
DEFAULT_VIDEO_MODEL = "diffusers/LTX-2.3-Diffusers"

TEXT_MODEL = os.getenv("LOCAL_TEXT_MODEL", DEFAULT_TEXT_MODEL)
IMAGE_MODEL = os.getenv("LOCAL_IMAGE_MODEL", DEFAULT_IMAGE_MODEL)
VIDEO_MODEL = os.getenv("LOCAL_VIDEO_MODEL", DEFAULT_VIDEO_MODEL)
PRESET = os.getenv("LOCAL_RUNTIME_PRESET", "auto")
MOCK = os.getenv("LOCAL_RUNTIME_MOCK", "1") == "1"

app = FastAPI(title="AI AssemblyLine Local Runtime")
video_results: dict[str, bytes] = {}


class TextRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    prompt: str
    json_schema: dict[str, Any] | None = Field(default=None, alias="schema")
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


@dataclass(frozen=True)
class RuntimePreset:
    name: str
    text_quantization: Literal["none", "4bit"]
    image_size: tuple[int, int]
    image_steps: int
    video_size: tuple[int, int]
    video_steps: int
    video_fps: int


PRESETS = {
    "a100-full": RuntimePreset("a100-full", "none", (1024, 576), 28, (768, 512), 40, 24),
    "l4-balanced": RuntimePreset("l4-balanced", "4bit", (768, 432), 16, (640, 384), 24, 16),
    "t4-starter": RuntimePreset("t4-starter", "4bit", (512, 288), 8, (512, 288), 12, 12),
}


class LocalModelRuntime:
    def __init__(self) -> None:
        self.active_modality: str | None = None
        self.text_tokenizer: Any | None = None
        self.text_model: Any | None = None
        self.image_pipe: Any | None = None
        self.video_pipe: Any | None = None

    def preset(self) -> RuntimePreset:
        configured = PRESET if PRESET in PRESETS else _auto_preset_name()
        return PRESETS.get(configured, PRESETS["t4-starter"])

    def unload_except(self, modality: str) -> None:
        if self.active_modality == modality:
            return
        self.text_tokenizer = None
        self.text_model = None
        self.image_pipe = None
        self.video_pipe = None
        self.active_modality = modality
        gc.collect()
        try:
            import torch

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass

    def generate_text(self, request: TextRequest) -> dict[str, Any]:
        self.unload_except("text")
        tokenizer, model = self._load_text_model(request.modelId or TEXT_MODEL)
        prompt = _text_prompt(request)
        inputs = tokenizer.apply_chat_template(
            [{"role": "user", "content": prompt}],
            tokenize=True,
            add_generation_prompt=True,
            return_tensors="pt",
        )
        inputs = inputs.to(model.device)
        import torch

        with torch.inference_mode():
            output_ids = model.generate(
                inputs,
                max_new_tokens=request.maxTokens or 2048,
                temperature=request.temperature if request.temperature is not None else 0.2,
                do_sample=(request.temperature or 0) > 0,
                pad_token_id=tokenizer.eos_token_id,
            )
        generated = output_ids[0, inputs.shape[-1] :]
        content = tokenizer.decode(generated, skip_special_tokens=True).strip()
        if request.responseFormat == "json":
            content = _extract_json_text(content)
        return {
            "id": f"local-text-{uuid.uuid4()}",
            "modelId": request.modelId or TEXT_MODEL,
            "content": content,
            "usage": {"inputTokens": int(inputs.shape[-1]), "outputTokens": int(generated.shape[-1])},
        }

    def generate_image(self, request: ImageRequest) -> dict[str, Any]:
        self.unload_except("image")
        pipe = self._load_image_pipe(request.modelId or IMAGE_MODEL)
        import torch

        preset = self.preset()
        width, height = _fit_size(request.width, request.height, preset.image_size)
        generator = torch.Generator(device="cuda").manual_seed(request.seed) if request.seed is not None else None
        images = []
        for _ in range(max(1, min(request.count, 2))):
            result = pipe(
                prompt=request.prompt,
                negative_prompt=request.negativePrompt or "",
                width=width,
                height=height,
                num_inference_steps=preset.image_steps,
                generator=generator,
            )
            image = result.images[0]
            images.append({"b64": _image_to_base64(image), "mimeType": "image/png"})
        return {"modelId": request.modelId or IMAGE_MODEL, "images": images, "width": width, "height": height}

    def generate_video(self, request: VideoRequest) -> dict[str, Any]:
        self.unload_except("video")
        pipe = self._load_video_pipe(request.modelId or VIDEO_MODEL)
        import torch
        from diffusers.utils import export_to_video

        preset = self.preset()
        width, height = _fit_size(request.width, request.height, preset.video_size)
        duration = max(1, min(request.durationSeconds, 15))
        num_frames = max(9, math.ceil(duration * preset.video_fps))
        generator = torch.Generator(device="cuda").manual_seed(request.seed) if request.seed is not None else None
        kwargs: dict[str, Any] = {
            "prompt": request.prompt,
            "negative_prompt": request.negativePrompt or "",
            "width": width,
            "height": height,
            "num_frames": num_frames,
            "frame_rate": preset.video_fps,
            "num_inference_steps": preset.video_steps,
            "generator": generator,
        }
        if request.startImageB64:
            kwargs["image"] = Image.open(io.BytesIO(base64.b64decode(request.startImageB64))).convert("RGB")
        result = pipe(**kwargs)
        frames = getattr(result, "frames", None) or getattr(result, "videos", None)
        if not frames:
            raise RuntimeError("LTX pipeline did not return video frames.")
        frames = frames[0] if isinstance(frames, list) and frames and isinstance(frames[0], list) else frames
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as handle:
            temp_path = handle.name
        export_to_video(frames, temp_path, fps=preset.video_fps)
        with open(temp_path, "rb") as video_file:
            data = video_file.read()
        os.remove(temp_path)
        job_id = f"local-video-{uuid.uuid4()}"
        video_results[job_id] = data
        return {"jobId": job_id, "isAsync": True, "modelId": request.modelId or VIDEO_MODEL}

    def _load_text_model(self, model_id: str) -> tuple[Any, Any]:
        if self.text_model is not None and self.text_tokenizer is not None:
            return self.text_tokenizer, self.text_model
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

        kwargs: dict[str, Any] = {
            "device_map": "auto",
            "torch_dtype": torch.bfloat16 if torch.cuda.is_available() and torch.cuda.is_bf16_supported() else torch.float16,
            "trust_remote_code": True,
        }
        if self.preset().text_quantization == "4bit":
            kwargs["quantization_config"] = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_compute_dtype=torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16,
            )
            kwargs.pop("torch_dtype", None)
        self.text_tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)
        self.text_model = AutoModelForCausalLM.from_pretrained(model_id, **kwargs)
        return self.text_tokenizer, self.text_model

    def _load_image_pipe(self, model_id: str) -> Any:
        if self.image_pipe is not None:
            return self.image_pipe
        import torch
        from diffusers import DiffusionPipeline

        self.image_pipe = _load_diffusion_pipeline(DiffusionPipeline, model_id, torch)
        return self.image_pipe

    def _load_video_pipe(self, model_id: str) -> Any:
        if self.video_pipe is not None:
            return self.video_pipe
        import torch
        try:
            from diffusers import LTX2Pipeline

            pipeline_cls = LTX2Pipeline
        except ImportError:
            from diffusers import DiffusionPipeline

            pipeline_cls = DiffusionPipeline
        self.video_pipe = _load_diffusion_pipeline(pipeline_cls, model_id, torch)
        return self.video_pipe


runtime = LocalModelRuntime()


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "mock": MOCK,
        "preset": runtime.preset().name,
        "gpu": _gpu_summary(),
        "models": {"text": TEXT_MODEL, "image": IMAGE_MODEL, "video": VIDEO_MODEL},
    }


@app.post("/v1/text")
def text(request: TextRequest) -> dict[str, Any]:
    if MOCK:
        content = _mock_structured_script_analysis(request.prompt)
        return {
            "id": f"local-text-{uuid.uuid4()}",
            "modelId": request.modelId or TEXT_MODEL,
            "content": content,
            "usage": {"inputTokens": max(1, len(request.prompt) // 4), "outputTokens": max(1, len(content) // 4)},
        }
    return _runtime_call(lambda: runtime.generate_text(request))


@app.post("/v1/image")
def image(request: ImageRequest) -> dict[str, Any]:
    if MOCK:
        encoded = _png_base64(request.width, request.height)
        return {
            "modelId": request.modelId or IMAGE_MODEL,
            "images": [{"b64": encoded, "mimeType": "image/png"} for _ in range(max(1, min(request.count, 2)))],
        }
    return _runtime_call(lambda: runtime.generate_image(request))


@app.post("/v1/video")
def video(request: VideoRequest) -> dict[str, Any]:
    if MOCK:
        job_id = f"local-video-{uuid.uuid4()}"
        video_results[job_id] = _tiny_mp4_placeholder()
        return {"jobId": job_id, "isAsync": True, "modelId": request.modelId or VIDEO_MODEL}
    return _runtime_call(lambda: runtime.generate_video(request))


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


def _runtime_call(callback: Any) -> dict[str, Any]:
    try:
        return callback()
    except HTTPException:
        raise
    except Exception as error:
        message = str(error) or error.__class__.__name__
        if "out of memory" in message.lower() or "cuda" in message.lower() and "memory" in message.lower():
            raise HTTPException(
                status_code=507,
                detail=f"Local model runtime ran out of GPU memory on preset {runtime.preset().name}. Use an A100 runtime or a smaller preset.",
            ) from error
        raise HTTPException(status_code=500, detail=f"Local model runtime failed: {message}") from error


def _text_prompt(request: TextRequest) -> str:
    instruction = "Return only valid JSON. Do not include Markdown fences or commentary." if request.responseFormat == "json" else ""
    schema_text = f"\nJSON schema:\n{json.dumps(request.json_schema)}" if request.json_schema else ""
    return f"{instruction}\n{request.prompt}{schema_text}".strip()


def _extract_json_text(value: str) -> str:
    stripped = value.strip()
    if stripped.startswith("```"):
        stripped = stripped.strip("`")
        stripped = stripped.removeprefix("json").strip()
    start = min([index for index in [stripped.find("{"), stripped.find("[")] if index >= 0], default=-1)
    if start > 0:
        stripped = stripped[start:]
    return stripped


def _fit_size(request_width: int, request_height: int, max_size: tuple[int, int]) -> tuple[int, int]:
    max_width, max_height = max_size
    ratio = min(max_width / max(1, request_width), max_height / max(1, request_height), 1)
    width = max(64, int(request_width * ratio) // 8 * 8)
    height = max(64, int(request_height * ratio) // 8 * 8)
    return width, height


def _auto_preset_name() -> str:
    try:
        import torch

        if not torch.cuda.is_available():
            return "t4-starter"
        name = torch.cuda.get_device_name(0).lower()
        total_gb = torch.cuda.get_device_properties(0).total_memory / (1024**3)
        if "a100" in name or total_gb >= 35:
            return "a100-full"
        if "l4" in name or total_gb >= 20:
            return "l4-balanced"
    except Exception:
        pass
    return "t4-starter"


def _gpu_summary() -> dict[str, Any]:
    try:
        import torch

        if not torch.cuda.is_available():
            return {"available": False}
        props = torch.cuda.get_device_properties(0)
        return {
            "available": True,
            "name": torch.cuda.get_device_name(0),
            "totalMemoryGb": round(props.total_memory / (1024**3), 1),
            "bf16": bool(torch.cuda.is_bf16_supported()),
        }
    except Exception as error:
        return {"available": False, "error": str(error)}


def _load_diffusion_pipeline(pipeline_cls: Any, model_id: str, torch_module: Any) -> Any:
    dtype = torch_module.bfloat16 if torch_module.cuda.is_available() and torch_module.cuda.is_bf16_supported() else torch_module.float16
    kwargs: dict[str, Any] = {"dtype": dtype}
    if torch_module.cuda.is_available():
        kwargs["device_map"] = "cuda"
    try:
        pipe = pipeline_cls.from_pretrained(model_id, **kwargs)
    except TypeError:
        kwargs["torch_dtype"] = kwargs.pop("dtype")
        pipe = pipeline_cls.from_pretrained(model_id, **kwargs)
    if torch_module.cuda.is_available() and not getattr(pipe, "hf_device_map", None):
        pipe = pipe.to("cuda")
    return pipe


def _image_to_base64(image: Image.Image) -> str:
    output = io.BytesIO()
    image.save(output, format="PNG")
    return base64.b64encode(output.getvalue()).decode("ascii")


def _mock_structured_script_analysis(prompt: str) -> str:
    if "shotBreakdowns" in prompt:
        return '{"shotBreakdowns":[{"sceneNumber":1,"shots":[{"shotNumber":1,"action":"A simple cinematic moment unfolds.","cameraAngle":"wide","cameraMovement":"slow push in","lensNotes":"natural perspective","lightingNotes":"soft light"}]}]}'
    if "sceneAssetLinks" in prompt:
        return '{"assets":[{"canonicalName":"Main Character","type":"character","aliases":["Main Character"],"description":"The story lead.","firstAppearance":{"sceneNumber":1,"shotNumber":1}}],"sceneAssetLinks":[{"sceneNumber":1,"assetName":"Main Character"}],"shotAssetLinks":[{"sceneNumber":1,"shotNumber":1,"assetName":"Main Character"}],"warnings":[]}'
    return '{"scenes":[{"sceneNumber":1,"heading":"UNTITLED SCENE","summary":"A short film idea becomes a simple scene.","scriptStartLine":1,"scriptEndLine":3,"locationHint":"Studio"}]}'


def _png_base64(width: int, height: int) -> str:
    image = Image.new("RGB", (max(64, min(width, 1024)), max(64, min(height, 1024))), color=(39, 113, 128))
    return _image_to_base64(image)


def _tiny_mp4_placeholder() -> bytes:
    return base64.b64decode(
        "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAABBtZGF0AAAAAA=="
    )
