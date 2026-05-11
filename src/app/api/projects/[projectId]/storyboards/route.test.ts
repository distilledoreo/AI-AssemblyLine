import { afterEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  addFrameComment: vi.fn(),
  attachSketch: vi.fn(),
  generateStoryboardFrame: vi.fn(),
  getProjectRole: vi.fn(),
  getScriptAnalysisGraphForProject: vi.fn(),
  requireCurrentUser: vi.fn(),
  updateFrameVersion: vi.fn(),
}));

vi.mock("@/server/repository", () => ({
  getProjectRole: routeMocks.getProjectRole,
  getScriptAnalysisGraphForProject: routeMocks.getScriptAnalysisGraphForProject,
}));
vi.mock("@/server/session", () => ({ requireCurrentUser: routeMocks.requireCurrentUser }));
vi.mock("@/server/storyboard", () => ({
  addFrameComment: routeMocks.addFrameComment,
  attachSketch: routeMocks.attachSketch,
  generateStoryboardFrame: routeMocks.generateStoryboardFrame,
  updateFrameVersion: routeMocks.updateFrameVersion,
}));

const context = { params: Promise.resolve({ projectId: "33333333-3333-4333-8333-333333333333" }) };

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/projects/33333333-3333-4333-8333-333333333333/storyboards", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function multipartRequest(form: FormData) {
  return new Request("http://localhost/api/projects/33333333-3333-4333-8333-333333333333/storyboards", {
    method: "POST",
    body: form,
  });
}

describe("Storyboard API permissions", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("allows reviewers to approve frames without generation permission", async () => {
    routeMocks.requireCurrentUser.mockResolvedValue({ id: "reviewer-1" });
    routeMocks.getProjectRole.mockResolvedValue("reviewer");
    routeMocks.updateFrameVersion.mockResolvedValue({ frameVersions: [] });
    const { POST } = await import("@/app/api/projects/[projectId]/storyboards/route");

    const response = await POST(
      jsonRequest({
        action: "frame",
        frameVersionId: "11111111-1111-4111-8111-111111111111",
        status: "approved",
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(routeMocks.updateFrameVersion).toHaveBeenCalledWith({
      projectId: "33333333-3333-4333-8333-333333333333",
      action: "frame",
      frameVersionId: "11111111-1111-4111-8111-111111111111",
      status: "approved",
    });
  });

  it("denies reviewers from generating storyboard frames", async () => {
    routeMocks.requireCurrentUser.mockResolvedValue({ id: "reviewer-1" });
    routeMocks.getProjectRole.mockResolvedValue("reviewer");
    const { POST } = await import("@/app/api/projects/[projectId]/storyboards/route");

    const response = await POST(
      jsonRequest({
        action: "generate",
        shotId: "22222222-2222-4222-8222-222222222222",
      }),
      context,
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("forbidden");
    expect(routeMocks.generateStoryboardFrame).not.toHaveBeenCalled();
  });

  it("returns a client error when sketch upload omits the file", async () => {
    routeMocks.requireCurrentUser.mockResolvedValue({ id: "artist-1" });
    routeMocks.getProjectRole.mockResolvedValue("artist");
    const form = new FormData();
    form.set("shotId", "22222222-2222-4222-8222-222222222222");
    const { POST } = await import("@/app/api/projects/[projectId]/storyboards/route");

    const response = await POST(multipartRequest(form), context);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("missing_upload_file");
    expect(routeMocks.attachSketch).not.toHaveBeenCalled();
  });
});
