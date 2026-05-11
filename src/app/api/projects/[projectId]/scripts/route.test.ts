import { afterEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  getProjectRole: vi.fn(),
  requireCurrentUser: vi.fn(),
  runScriptAnalysis: vi.fn(),
  uploadScriptForProject: vi.fn(),
}));

vi.mock("@/server/repository", () => ({
  getProjectRole: routeMocks.getProjectRole,
}));
vi.mock("@/server/session", () => ({ requireCurrentUser: routeMocks.requireCurrentUser }));
vi.mock("@/server/scriptAnalysis", () => ({
  runScriptAnalysis: routeMocks.runScriptAnalysis,
  uploadScriptForProject: routeMocks.uploadScriptForProject,
}));

const context = { params: Promise.resolve({ projectId: "33333333-3333-4333-8333-333333333333" }) };

function multipartRequest(form: FormData) {
  return new Request("http://localhost/api/projects/33333333-3333-4333-8333-333333333333/scripts", {
    method: "POST",
    body: form,
  });
}

describe("Script API uploads", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a client error when multipart script upload omits the file", async () => {
    routeMocks.requireCurrentUser.mockResolvedValue({ id: "producer-1" });
    routeMocks.getProjectRole.mockResolvedValue("producer");
    const { POST } = await import("@/app/api/projects/[projectId]/scripts/route");

    const response = await POST(multipartRequest(new FormData()), context);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("missing_upload_file");
    expect(routeMocks.uploadScriptForProject).not.toHaveBeenCalled();
  });
});
