import { beforeEach, describe, expect, it } from "vitest";
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
  const workspace = createWorkspaceForUser(user.id, { name: "Video Lab" });
  const project = await createProjectForWorkspace(user.id, { workspaceId: workspace.id, title: "Video" });
  const analyzed = await uploadScriptForProject({ projectId: project.id, filename: "video.txt", text: scriptText });
  analyzed.assets.forEach((asset) => transitionAssetStatus(asset.id, "approved"));
  const ready = getScriptAnalysisGraph(project.id);
  const generated = await generateStoryboardFrame({ projectId: project.id, shotId: ready.shots[0].id });
  updateFrameVersion({ projectId: project.id, frameVersionId: generated.frameVersions[0].id, status: "approved" });
  return { project, graph: getScriptAnalysisGraph(project.id) };
}

describe("video workflow", () => {
  beforeEach(() => resetStoreForTests());

  it("generates shot and scene clips from approved storyboard frames and approves clips", async () => {
    const { project, graph } = await projectWithApprovedFrame();

    const shotClipGraph = await generateVideoClip({
      projectId: project.id,
      mode: "shot",
      shotId: graph.shots[0].id,
      providerSlug: "runway",
    });
    const clipVersion = shotClipGraph.clipVersions[0];
    updateClipVersion({ projectId: project.id, clipVersionId: clipVersion.id, status: "approved" });

    const sceneClipGraph = await generateVideoClip({
      projectId: project.id,
      mode: "scene",
      sceneId: graph.scenes[0].id,
      providerSlug: "kling",
    });

    expect(sceneClipGraph.videoClips).toHaveLength(2);
    expect(getScriptAnalysisGraph(project.id).clipVersions[0].status).toBe("approved");
    expect(sceneClipGraph.jobs.at(-1)?.status).toBe("complete");
  });

  it("blocks clips without approved frames and exposes video provider capabilities", async () => {
    const { user } = await signInWithCredentials({ email: "novideo@example.com", password: "assemblyline" });
    const workspace = createWorkspaceForUser(user.id, { name: "No Video" });
    const project = await createProjectForWorkspace(user.id, { workspaceId: workspace.id, title: "No Video" });
    const graph = await uploadScriptForProject({ projectId: project.id, filename: "video.txt", text: scriptText });

    await expect(generateVideoClip({ projectId: project.id, mode: "shot", shotId: graph.shots[0].id })).rejects.toMatchObject({
      code: "missing_approved_frames",
    });
    expect(new RunwayAdapter().getCapabilities().requiresAsyncPolling).toBe(true);
    expect(new KlingAdapter().getCapabilities().supportsImageToVideo).toBe(true);
    expect(checkFfmpegAvailability().message).toBeTruthy();
  });
});
