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
import { generateVideoClip, updateClipVersion } from "@/server/video";
import { checkFfmpegAvailability } from "@/server/media";
import { KlingAdapter, RunwayAdapter } from "@/providers/videoProviders";

const scriptText = `INT. COFFEE SHOP - MORNING
ANNA
Anna holds a brass key.`;

async function projectWithApprovedFrame() {
  const { user } = await signInWithCredentials({ email: "video@example.com", password: "assemblyline" });
  const workspace = await createWorkspaceForUser(user.id, { name: "Video Lab" });
  const project = await createProjectForWorkspace(user.id, { workspaceId: workspace.id, title: "Video" });
  const analyzed = await uploadScriptForProject({ projectId: project.id, filename: "video.txt", text: scriptText });
  await Promise.all(analyzed.assets.map((asset) => transitionAssetStatus(asset.id, "approved")));
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
      providerSlug: "kling",
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
    expect(new KlingAdapter().getCapabilities().supportsImageToVideo).toBe(true);
    expect(checkFfmpegAvailability().message).toBeTruthy();
  });

  it("submits live Runway jobs without writing mock video bytes", async () => {
    const { project, graph } = await projectWithApprovedFrame();
    vi.stubEnv("RUNWAYML_API_SECRET", "key_runway_live");
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
        headers: expect.objectContaining({ Authorization: "Bearer key_runway_live" }),
      }),
    );
  });
});
