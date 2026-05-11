import { expect, test } from "@playwright/test";

test("creator can run the core project workflow and export a bundle", async ({ page }) => {
  await page.goto("/signin");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with GitHub" })).toBeVisible();
  await page.getByRole("textbox", { name: "Email" }).fill(`e2e-${Date.now()}@example.com`);
  await page.getByRole("textbox", { name: "Password" }).fill("assemblyline");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByLabel("API key")).toHaveValue("");
  const providerSelect = page.getByLabel("Provider", { exact: true });
  await expect(providerSelect).toContainText("OpenAI");
  await expect(providerSelect).toContainText("Stability");
  await expect(providerSelect).toContainText("Runway");
  await expect(providerSelect).not.toContainText("Replicate");

  const projectId = await page.evaluate(async () => {
    async function api(path: string, options: RequestInit = {}) {
      const response = await fetch(path, {
        credentials: "include",
        ...options,
        headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(`${path} failed: ${JSON.stringify(body)}`);
      }
      return body;
    }

    const workspace = await api("/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ name: "E2E Studio" }),
    });
    const project = await api("/api/projects", {
      method: "POST",
      body: JSON.stringify({ workspaceId: workspace.workspace.id, title: "E2E Short" }),
    });
    let graph = await api(`/api/projects/${project.project.id}/scripts`, {
      method: "POST",
      body: JSON.stringify({
        filename: "e2e-script.txt",
        text: "INT. STUDIO - DAY\nMIRA\nThe camera line comes alive.\nMira holds a prism toward the lens.",
      }),
    });
    for (const asset of graph.assets) {
      graph = await api(`/api/projects/${project.project.id}/asset-bible`, {
        method: "POST",
        body: JSON.stringify({ action: "status", assetId: asset.id, status: "approved" }),
      });
    }
    graph = await api(`/api/projects/${project.project.id}/storyboards`, {
      method: "POST",
      body: JSON.stringify({ action: "generate", shotId: graph.shots[0].id, keyframeIndex: 0 }),
    });
    graph = await api(`/api/projects/${project.project.id}/storyboards`, {
      method: "POST",
      body: JSON.stringify({ action: "frame", frameVersionId: graph.frameVersions[0].id, status: "approved" }),
    });
    await api(`/api/projects/${project.project.id}/videos`, {
      method: "POST",
      body: JSON.stringify({ action: "generate", mode: "shot", shotId: graph.shots[0].id, providerSlug: "runway" }),
    });
    await api(`/api/projects/${project.project.id}/operations`, {
      method: "POST",
      body: JSON.stringify({ action: "export" }),
    });
    return project.project.id;
  });

  await page.goto(`/projects/${projectId}`);
  await expect(page.getByRole("heading", { name: "Export and operations" })).toBeVisible();
  await expect(page.getByText("Bundle version")).toBeVisible();
  await expect(page.getByText("bytedance-seedance, pika, luma, elevenlabs")).toBeVisible();
  await expect(page.getByText("Approved frames: 1")).toBeVisible();

  await page.getByRole("link", { name: "Script" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/script$`));
  await expect(page.getByRole("heading", { name: "Script analysis" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Scenes and shots" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Assets and requirements" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Export and operations" })).toHaveCount(0);

  await page.getByRole("link", { name: "Asset Bible" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/asset-bible$`));
  const assetBiblePanel = page.locator('section[aria-labelledby="asset-bible-heading"]');
  await expect(assetBiblePanel.getByRole("heading", { name: "Asset Bible lifecycle" })).toBeVisible();
  await expect(assetBiblePanel.getByText(/Scenes ready:/)).toBeVisible();
  await expect(assetBiblePanel.getByText("0 references", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Script analysis" })).toHaveCount(0);

  await page.getByRole("link", { name: "Storyboard" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/storyboard$`));
  await expect(page.getByRole("heading", { name: "Storyboard frames" })).toBeVisible();
  await expect(page.getByLabel("Fabric storyboard markup canvas")).toBeVisible();
  await page.getByRole("button", { name: "Rectangle" }).click();
  await page.getByRole("button", { name: "Save markup" }).click();
  await expect(page.getByText("Storyboard updated.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Export and operations" })).toHaveCount(0);

  await page.getByRole("link", { name: "Video" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/video$`));
  await expect(page.getByRole("heading", { name: "Video clips" })).toBeVisible();
});
