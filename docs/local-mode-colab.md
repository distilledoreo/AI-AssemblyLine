# Local Mode on Google Colab Pro

Local Mode lets AI AssemblyLine run without paid provider API keys. The web app still runs in Next.js, but text, image, and video generation are sent to a Python runtime in the same Colab session.

## What Local Mode Uses

- Text: Qwen3.6-27B through `local-qwen-text`
- Images: Qwen-Image-2512 through `local-qwen-image`
- Video: LTX-2.3 through `local-ltx-video`

The app talks to the local runtime through `LOCAL_RUNTIME_URL`, which defaults to `http://127.0.0.1:7861`.

## Colab Pro Target

Local Mode targets **A100 full quality** first. Because Colab Pro may assign different GPUs, the notebook must detect the available GPU and choose one of these presets:

- `a100-full`: full Local Mode target with sequential text, image, and video model loading.
- `l4-balanced`: quantized/offloaded text, lower image resolution, and short distilled video clips.
- `t4-starter`: smallest smoke preset for short clips and low-resolution outputs. If a selected model cannot fit, the notebook should show a plain message recommending an A100 runtime.

The product promise is that nontechnical users can complete the idea-to-video workflow on an A100 Colab Pro runtime with very little setup. L4/T4 runtimes are supported as fallback presets, not as the full-quality target.

## Quick Start

1. Open `notebooks/AI_AssemblyLine_Local_Mode_Colab.ipynb`.
2. Select a GPU runtime.
3. Run all cells.
4. Open the app link printed by the notebook.
5. Create a project with **Local Mode - use the Colab runtime**.

Local Mode does not require OpenAI, Stability, Runway, or Google AI keys. An optional Hugging Face token may be needed when downloading gated or rate-limited model files.

## Runtime Contract

The local runtime exposes:

- `GET /health`
- `POST /v1/text`
- `POST /v1/image`
- `POST /v1/video`
- `GET /v1/video/:jobId`
- `GET /v1/video/:jobId/result`

The checked-in `local-runtime/app.py` starts with a mock backend so the app contract can be tested quickly. The Colab notebook is responsible for installing GPU model dependencies and replacing the mock backend with real model inference.
