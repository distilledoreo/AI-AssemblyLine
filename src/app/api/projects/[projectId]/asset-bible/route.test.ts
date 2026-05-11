import { afterEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  getProjectRole: vi.fn(),
  getScriptAnalysisGraphForProject: vi.fn(),
  requireCurrentUser: vi.fn(),
  generateAssetReference: vi.fn(),
  mergeAssets: vi.fn(),
  splitAsset: vi.fn(),
  transitionAssetStatus: vi.fn(),
  updateProjectStyle: vi.fn(),
  uploadAssetReference: vi.fn(),
  upsertAssetDetail: vi.fn(),
}));

vi.mock("@/server/repository", () => ({
  getProjectRole: routeMocks.getProjectRole,
  getScriptAnalysisGraphForProject: routeMocks.getScriptAnalysisGraphForProject,
}));
vi.mock("@/server/session", () => ({ requireCurrentUser: routeMocks.requireCurrentUser }));
vi.mock("@/server/assetBible", () => ({
  generateAssetReference: routeMocks.generateAssetReference,
  mergeAssets: routeMocks.mergeAssets,
  splitAsset: routeMocks.splitAsset,
  transitionAssetStatus: routeMocks.transitionAssetStatus,
  updateProjectStyle: routeMocks.updateProjectStyle,
  uploadAssetReference: routeMocks.uploadAssetReference,
  upsertAssetDetail: routeMocks.upsertAssetDetail,
}));

const context = { params: Promise.resolve({ projectId: "33333333-3333-4333-8333-333333333333" }) };

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/projects/33333333-3333-4333-8333-333333333333/asset-bible", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function multipartRequest(form: FormData) {
  return new Request("http://localhost/api/projects/33333333-3333-4333-8333-333333333333/asset-bible", {
    method: "POST",
    body: form,
  });
}

describe("Asset Bible API permissions", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("allows reviewers to approve assets without upload-reference permission", async () => {
    routeMocks.requireCurrentUser.mockResolvedValue({ id: "reviewer-1" });
    routeMocks.getProjectRole.mockResolvedValue("reviewer");
    routeMocks.getScriptAnalysisGraphForProject.mockResolvedValue({ assets: [] });
    const { POST } = await import("@/app/api/projects/[projectId]/asset-bible/route");

    const response = await POST(
      jsonRequest({
        action: "status",
        assetId: "11111111-1111-4111-8111-111111111111",
        status: "approved",
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(routeMocks.transitionAssetStatus).toHaveBeenCalledWith(
      "33333333-3333-4333-8333-333333333333",
      "11111111-1111-4111-8111-111111111111",
      "approved",
    );
  });

  it("denies reviewers from requesting asset generation", async () => {
    routeMocks.requireCurrentUser.mockResolvedValue({ id: "reviewer-1" });
    routeMocks.getProjectRole.mockResolvedValue("reviewer");
    const { POST } = await import("@/app/api/projects/[projectId]/asset-bible/route");

    const response = await POST(
      jsonRequest({
        action: "generate",
        assetId: "11111111-1111-4111-8111-111111111111",
        providerSlug: "stability",
      }),
      context,
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("forbidden");
    expect(routeMocks.generateAssetReference).not.toHaveBeenCalled();
  });

  it("returns a client error when reference upload omits the file", async () => {
    routeMocks.requireCurrentUser.mockResolvedValue({ id: "producer-1" });
    routeMocks.getProjectRole.mockResolvedValue("producer");
    const form = new FormData();
    form.set("assetId", "11111111-1111-4111-8111-111111111111");
    const { POST } = await import("@/app/api/projects/[projectId]/asset-bible/route");

    const response = await POST(multipartRequest(form), context);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("missing_upload_file");
    expect(routeMocks.uploadAssetReference).not.toHaveBeenCalled();
  });
});
