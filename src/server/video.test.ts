import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProjectForWorkspace,
  createWorkspaceForUser,
  getScriptAnalysisGraph,
  resetStoreForTests,
  signInWithCredentials,
} from "@/server/repository";
import { transitionAssetStatus } from "@/server/assetBible";
import { uploadScriptForProject } from "@/server/scriptAnalysis";
import { generateStoryboardFrame, updateFrameVersion } from "@/server/storyboard";
import { generateVideoClip, processSubmittedVideoProviderJobs, processVideoProviderResult, updateClipVersion } from "@/server/video";
import { checkFfmpegAvailability } from "@/server/media";
import { GoogleVeoAdapter, KlingAdapter, RunwayAdapter } from "@/providers/videoProviders";

const scriptText = `INT. COFFEE SHOP - MORNING
ANNA
Anna holds a brass key.`;

async function projectWithApprovedFrame() {
  const { user } = await signInWithCredentials({ email: "video@example.com", password: "assemblyline" });
  const workspace = await createWorkspaceForUser(user.id, { name: "Video Lab" });
  const project = await createProjectForWorkspace(user.id, { workspaceId: workspace.id, title: "Video" });
  const analyzed = await uploadScriptForProject({ projectId: project.id, filename: "video.txt", text: scriptText });
  await Promise.all(analyzed.assets.map((asset) => transitionAssetStatus(project.id, asset.id, "approved")));
  const ready = getScriptAnalysisGraph(project.id);
  const generated = await generateStoryboardFrame({ projectId: project.id, shotId: ready.shots[0].id });
  await updateFrameVersion({ projectId: project.id, frameVersionId: generated.frameVersions[0].id, status: "approved" });
  return { project, graph: getScriptAnalysisGraph(project.id) };
}

describe("video workflow", () => {
  beforeEach(() => resetStoreForTests());
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("generates shot and scene clips from approved storyboard frames and approves clips", async () => {
    const { project, graph } = await projectWithApprovedFrame();

    const shotClipGraph = await generateVideoClip({
      projectId: project.id,
      mode: "shot",
      shotId: graph.shots[0].id,
      providerSlug: "runway",
    });
    const clipVersion = shotClipGraph.clipVersions[0];
    await updateClipVersion({ projectId: project.id, clipVersionId: clipVersion.id, status: "approved" });
    const replacementFrame = await generateStoryboardFrame({ projectId: project.id, shotId: graph.shots[0].id });
    const replacementVersion = replacementFrame.frameVersions.at(-1)!;
    await updateFrameVersion({ projectId: project.id, frameVersionId: replacementVersion.id, status: "approved" });

    const staleGraph = getScriptAnalysisGraph(project.id);
    expect(staleGraph.clipVersions.find((version) => version.id === clipVersion.id)?.status).toBe("stale");
    expect(staleGraph.clipVersions.find((version) => version.id === clipVersion.id)?.isStale).toBe(true);

    const sceneClipGraph = await generateVideoClip({
      projectId: project.id,
      mode: "scene",
      sceneId: graph.scenes[0].id,
      providerSlug: "runway",
    });

    expect(sceneClipGraph.videoClips).toHaveLength(2);
    expect(getScriptAnalysisGraph(project.id).clipVersions.some((version) => version.status === "draft")).toBe(true);
    expect(sceneClipGraph.jobs.at(-1)?.status).toBe("complete");
  });

  it("blocks clips without approved frames and exposes video provider capabilities", async () => {
    const { user } = await signInWithCredentials({ email: "novideo@example.com", password: "assemblyline" });
    const workspace = await createWorkspaceForUser(user.id, { name: "No Video" });
    const project = await createProjectForWorkspace(user.id, { workspaceId: workspace.id, title: "No Video" });
    const graph = await uploadScriptForProject({ projectId: project.id, filename: "video.txt", text: scriptText });

    await expect(generateVideoClip({ projectId: project.id, mode: "shot", shotId: graph.shots[0].id })).rejects.toMatchObject({
      code: "missing_approved_frames",
    });
    expect(new RunwayAdapter().getCapabilities().requiresAsyncPolling).toBe(true);
    expect(new GoogleVeoAdapter().getCapabilities().models).toContain("veo-3.1-generate-preview");
    expect(new KlingAdapter().getCapabilities().supportsImageToVideo).toBe(true);
    expect(checkFfmpegAvailability().message).toBeTruthy();
  });

  it("rejects invalid and cross-project video generation targets before creating jobs", async () => {
    const first = await projectWithApprovedFrame();
    const second = await projectWithApprovedFrame();

    await expect(
      generateVideoClip({
        projectId: first.project.id,
        mode: "shot",
        sceneId: first.graph.scenes[0].id,
        providerSlug: "runway",
      }),
    ).rejects.toMatchObject({ code: "invalid_video_target" });
    await expect(
      generateVideoClip({
        projectId: first.project.id,
        mode: "scene",
        shotId: first.graph.shots[0].id,
        providerSlug: "runway",
      }),
    ).rejects.toMatchObject({ code: "invalid_video_target" });
    await expect(
      generateVideoClip({
        projectId: second.project.id,
        mode: "shot",
        shotId: first.graph.shots[0].id,
        providerSlug: "runway",
      }),
    ).rejects.toMatchObject({ code: "not_found" });

    expect(getScriptAnalysisGraph(first.project.id).jobs.filter((job) => job.type === "video_clip")).toHaveLength(0);
    expect(getScriptAnalysisGraph(second.project.id).jobs.filter((job) => job.type === "video_clip")).toHaveLength(0);
  });

  it("rejects clip version updates when the version belongs to another project", async () => {
    const first = await projectWithApprovedFrame();
    const second = await projectWithApprovedFrame();
    const firstGraph = await generateVideoClip({
      projectId: first.project.id,
      mode: "shot",
      shotId: first.graph.shots[0].id,
      providerSlug: "runway",
    });
    const foreignClipVersionId = firstGraph.clipVersions[0].id;

    await expect(
      updateClipVersion({
        projectId: second.project.id,
        clipVersionId: foreignClipVersionId,
        status: "approved",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects mock-backed video providers from generation paths", async () => {
    const { project, graph } = await projectWithApprovedFrame();

    await expect(
      generateVideoClip({
        projectId: project.id,
        mode: "shot",
        shotId: graph.shots[0].id,
        providerSlug: "kling",
      }),
    ).rejects.toMatchObject({ code: "unsupported_provider" });
  });

  it("submits live Runway jobs without writing mock video bytes", async () => {
    const { project, graph } = await projectWithApprovedFrame();
    vi.stubEnv("RUNWAYML_API_SECRET", "rw-prod-runway-smoke-abc123");
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: "task-runway-live-1", status: "PENDING" }));
    vi.stubGlobal("fetch", fetchMock);

    const submitted = await generateVideoClip({
      projectId: project.id,
      mode: "shot",
      shotId: graph.shots[0].id,
      providerSlug: "runway",
    });

    expect(submitted.videoClips).toHaveLength(0);
    expect(submitted.clipVersions).toHaveLength(0);
    expect(submitted.jobs.at(-1)).toMatchObject({
      type: "video_clip",
      status: "provider_submitted",
      providerJobId: "task-runway-live-1",
      outputPayload: expect.objectContaining({ providerJobId: "task-runway-live-1" }),
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.dev.runwayml.com/v1/image_to_video",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer rw-prod-runway-smoke-abc123" }),
      }),
    );
  });

  it("submits live Google AI Veo jobs without writing mock video bytes", async () => {
    const { project, graph } = await projectWithApprovedFrame();
    vi.stubEnv("GEMINI_API_KEY", "gemini-prod-smoke-abc123");
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ name: "operations/veo-live-1" }));
    vi.stubGlobal("fetch", fetchMock);

    const submitted = await generateVideoClip({
      projectId: project.id,
      mode: "shot",
      shotId: graph.shots[0].id,
      providerSlug: "google-ai",
    });

    expect(submitted.videoClips).toHaveLength(0);
    expect(submitted.clipVersions).toHaveLength(0);
    expect(submitted.jobs.at(-1)).toMatchObject({
      type: "video_clip",
      status: "provider_submitted",
      providerSlug: "google-ai",
      providerJobId: "operations/veo-live-1",
      outputPayload: expect.objectContaining({ providerJobId: "operations/veo-live-1" }),
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning",
      expect.objectContaining({
        headers: expect.objectContaining({ "x-goog-api-key": "gemini-prod-smoke-abc123" }),
      }),
    );
  });

  it("fails video generation instead of writing mock bytes when a provider returns no output", async () => {
    const { project, graph } = await projectWithApprovedFrame();
    vi.stubEnv("RUNWAYML_API_SECRET", "rw-prod-runway-smoke-abc123");
    vi.spyOn(RunwayAdapter.prototype, "generateVideo").mockResolvedValue({ isAsync: false });

    await expect(
      generateVideoClip({
        projectId: project.id,
        mode: "shot",
        shotId: graph.shots[0].id,
        providerSlug: "runway",
      }),
    ).rejects.toMatchObject({
      code: "provider_output_missing",
    });

    const failedGraph = getScriptAnalysisGraph(project.id);
    expect(failedGraph.videoClips).toHaveLength(0);
    expect(failedGraph.clipVersions).toHaveLength(0);
    expect(failedGraph.jobs.at(-1)).toMatchObject({
      type: "video_clip",
      status: "failed",
      errorClass: "fatal",
      errorMessage: "Video provider did not return video bytes or an async provider job id.",
    });
  });

  it("downloads completed Runway task output into a clip version", async () => {
    const { project, graph } = await projectWithApprovedFrame();
    vi.stubEnv("RUNWAYML_API_SECRET", "rw-prod-runway-smoke-abc123");
    const submitFetch = vi.fn().mockResolvedValue(Response.json({ id: "task-runway-live-2", status: "PENDING" }));
    vi.stubGlobal("fetch", submitFetch);
    const submitted = await generateVideoClip({
      projectId: project.id,
      mode: "shot",
      shotId: graph.shots[0].id,
      providerSlug: "runway",
    });
    const job = submitted.jobs.at(-1)!;
    const videoBytes = Buffer.from("runway-video-bytes");
    const pollFetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: "task-runway-live-2", status: "SUCCEEDED", output: ["https://example.com/video.mp4"] }))
      .mockResolvedValueOnce(new Response(videoBytes, { status: 200, headers: { "content-type": "video/mp4" } }));

    const completed = await processVideoProviderResult({
      projectId: project.id,
      jobId: job.id,
      fetchImpl: pollFetch,
    });

    expect(completed.videoClips).toHaveLength(1);
    expect(completed.clipVersions).toHaveLength(1);
    expect(completed.clipVersions[0].generationJobId).toBe(job.id);
    expect(completed.jobs.find((candidate) => candidate.id === job.id)).toMatchObject({
      status: "complete",
      providerJobId: "task-runway-live-2",
    });
    expect(pollFetch).toHaveBeenNthCalledWith(
      1,
      "https://api.dev.runwayml.com/v1/tasks/task-runway-live-2",
      expect.objectContaining({ method: "GET" }),
    );
    expect(pollFetch).toHaveBeenNthCalledWith(2, "https://example.com/video.mp4", expect.any(Object));
  });

  it("downloads completed Google AI Veo output into a clip version with the API key header", async () => {
    const { project, graph } = await projectWithApprovedFrame();
    vi.stubEnv("GEMINI_API_KEY", "gemini-prod-smoke-abc123");
    const submitFetch = vi.fn().mockResolvedValue(Response.json({ name: "operations/veo-live-2" }));
    vi.stubGlobal("fetch", submitFetch);
    const submitted = await generateVideoClip({
      projectId: project.id,
      mode: "shot",
      shotId: graph.shots[0].id,
      providerSlug: "google-ai",
    });
    const job = submitted.jobs.at(-1)!;
    const videoBytes = Buffer.from("google-veo-video-bytes");
    const pollFetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          done: true,
          response: {
            generateVideoResponse: {
              generatedSamples: [{ video: { uri: "https://generativelanguage.googleapis.com/v1beta/files/video-2:download" } }],
            },
          },
        }),
      )
      .mockResolvedValueOnce(new Response(videoBytes, { status: 200, headers: { "content-type": "video/mp4" } }));

    const completed = await processVideoProviderResult({
      projectId: project.id,
      jobId: job.id,
      fetchImpl: pollFetch,
    });

    expect(completed.videoClips).toHaveLength(1);
    expect(completed.clipVersions[0]).toMatchObject({
      status: "draft",
      generationJobId: job.id,
    });
    expect(pollFetch).toHaveBeenNthCalledWith(
      1,
      "https://generativelanguage.googleapis.com/v1beta/operations/veo-live-2",
      expect.objectContaining({ method: "GET" }),
    );
    expect(pollFetch).toHaveBeenNthCalledWith(
      2,
      "https://generativelanguage.googleapis.com/v1beta/files/video-2:download",
      expect.objectContaining({ headers: { "x-goog-api-key": "gemini-prod-smoke-abc123" } }),
    );
  });

  it("rejects completed Runway task output downloads with empty video bytes", async () => {
    const { project, graph } = await projectWithApprovedFrame();
    vi.stubEnv("RUNWAYML_API_SECRET", "rw-prod-runway-smoke-abc123");
    const submitFetch = vi.fn().mockResolvedValue(Response.json({ id: "task-runway-live-empty", status: "PENDING" }));
    vi.stubGlobal("fetch", submitFetch);
    const submitted = await generateVideoClip({
      projectId: project.id,
      mode: "shot",
      shotId: graph.shots[0].id,
      providerSlug: "runway",
    });
    const job = submitted.jobs.at(-1)!;
    const pollFetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ id: "task-runway-live-empty", status: "SUCCEEDED", output: ["https://example.com/empty.mp4"] }),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array(), { status: 200, headers: { "content-type": "video/mp4" } }));

    await expect(
      processVideoProviderResult({
        projectId: project.id,
        jobId: job.id,
        fetchImpl: pollFetch,
      }),
    ).rejects.toMatchObject({
      code: "provider_output_missing",
      message: "Runway output download did not include video bytes.",
    });

    const failedGraph = getScriptAnalysisGraph(project.id);
    expect(failedGraph.videoClips).toHaveLength(0);
    expect(failedGraph.clipVersions).toHaveLength(0);
    expect(failedGraph.jobs.find((candidate) => candidate.id === job.id)).toMatchObject({
      status: "processing_output",
    });
  });

  it("persists submitted Runway poll failures instead of leaving jobs processing", async () => {
    const { project, graph } = await projectWithApprovedFrame();
    vi.stubEnv("RUNWAYML_API_SECRET", "rw-prod-runway-smoke-abc123");
    const submitFetch = vi.fn().mockResolvedValue(Response.json({ id: "task-runway-live-poll-failure", status: "PENDING" }));
    vi.stubGlobal("fetch", submitFetch);
    const submitted = await generateVideoClip({
      projectId: project.id,
      mode: "shot",
      shotId: graph.shots[0].id,
      providerSlug: "runway",
    });
    const job = submitted.jobs.at(-1)!;
    const pollFetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ id: "task-runway-live-poll-failure", status: "SUCCEEDED", output: ["https://example.com/empty.mp4"] }),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array(), { status: 200, headers: { "content-type": "video/mp4" } }));

    const result = await processSubmittedVideoProviderJobs({ fetchImpl: pollFetch });

    expect(result).toMatchObject({
      processed: 1,
      results: [{ jobId: job.id, status: "failed", errorMessage: "Runway output download did not include video bytes." }],
    });
    const failedGraph = getScriptAnalysisGraph(project.id);
    expect(failedGraph.videoClips).toHaveLength(0);
    expect(failedGraph.clipVersions).toHaveLength(0);
    expect(failedGraph.jobs.find((candidate) => candidate.id === job.id)).toMatchObject({
      status: "failed",
      errorClass: "fatal",
      errorMessage: "Runway output download did not include video bytes.",
    });
    expect(failedGraph.events.at(-1)).toMatchObject({
      jobId: job.id,
      eventType: "status_change",
      message: "Runway output download did not include video bytes.",
      progressPct: 100,
    });
  });

  it("keeps submitted Runway jobs polling after retriable output download failures", async () => {
    const { project, graph } = await projectWithApprovedFrame();
    vi.stubEnv("RUNWAYML_API_SECRET", "rw-prod-runway-smoke-abc123");
    const submitFetch = vi.fn().mockResolvedValue(Response.json({ id: "task-runway-live-retry", status: "PENDING" }));
    vi.stubGlobal("fetch", submitFetch);
    const submitted = await generateVideoClip({
      projectId: project.id,
      mode: "shot",
      shotId: graph.shots[0].id,
      providerSlug: "runway",
    });
    const job = submitted.jobs.at(-1)!;
    const pollFetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: "task-runway-live-retry", status: "SUCCEEDED", output: ["https://example.com/video.mp4"] }))
      .mockResolvedValueOnce(new Response("gateway timeout", { status: 502 }));

    const result = await processSubmittedVideoProviderJobs({ fetchImpl: pollFetch });

    expect(result).toMatchObject({
      processed: 1,
      results: [{ jobId: job.id, status: "retrying", errorMessage: "Runway output download failed with status 502." }],
    });
    const retryGraph = getScriptAnalysisGraph(project.id);
    expect(retryGraph.videoClips).toHaveLength(0);
    expect(retryGraph.clipVersions).toHaveLength(0);
    const retryJob = retryGraph.jobs.find((candidate) => candidate.id === job.id)!;
    expect(retryJob).toMatchObject({
      status: "polling",
    });
    expect(retryJob.errorMessage).toBeUndefined();
    expect(retryJob.errorClass).toBeUndefined();
    expect(retryGraph.events.at(-1)).toMatchObject({
      jobId: job.id,
      eventType: "status_change",
      message: "Runway output download failed with status 502.",
      progressPct: 100,
    });
  });
});
