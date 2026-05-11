"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { FolderPlus, KeyRound, Plus, RefreshCw } from "lucide-react";
import type { Project, Workspace } from "@/server/types";

type SafeProviderKey = {
  id: string;
  workspaceId: string;
  providerSlug: string;
  label?: string;
  maskedKey: string;
  createdAt: string;
};

export function DashboardClient({
  initialWorkspaces,
  initialProjects,
}: Readonly<{ initialWorkspaces: Workspace[]; initialProjects: Project[] }>) {
  const [workspaces, setWorkspaces] = useState(initialWorkspaces);
  const [projects, setProjects] = useState(initialProjects);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(initialWorkspaces[0]?.id ?? "");
  const [workspaceName, setWorkspaceName] = useState("Studio Workspace");
  const [projectTitle, setProjectTitle] = useState("Untitled Short Film");
  const [providerSlug, setProviderSlug] = useState("openai");
  const [providerKey, setProviderKey] = useState("");
  const [providerKeys, setProviderKeys] = useState<SafeProviderKey[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === selectedWorkspaceId),
    [selectedWorkspaceId, workspaces],
  );

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: workspaceName }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error?.message ?? "Workspace creation failed.");
      return;
    }
    setWorkspaces((current) => [...current, body.workspace]);
    setSelectedWorkspaceId(body.workspace.id);
    setNotice(`Workspace "${body.workspace.name}" created.`);
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!selectedWorkspaceId) {
      setError("Create or select a workspace first.");
      return;
    }
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: selectedWorkspaceId,
        title: projectTitle,
        targetFormat: "short_film",
        aspectRatio: "16:9",
        rightsPolicy: "unrestricted",
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error?.message ?? "Project creation failed.");
      return;
    }
    setProjects((current) => [...current, body.project]);
    setNotice(`Project "${body.project.title}" created.`);
  }

  async function saveKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!selectedWorkspaceId) {
      setError("Create or select a workspace first.");
      return;
    }
    if (providerKey.trim().length < 3) {
      setError("Enter a real provider API key before saving.");
      return;
    }
    const response = await fetch("/api/provider-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: selectedWorkspaceId,
        providerSlug,
        apiKey: providerKey,
        label: providerSlug.toUpperCase(),
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error?.message ?? "Provider key save failed.");
      return;
    }
    setProviderKeys((current) => [
      body.providerKey,
      ...current.filter((key) => key.providerSlug !== body.providerKey.providerSlug),
    ]);
    setNotice(`${body.providerKey.label} key stored server-side.`);
  }

  async function refreshProviderKeys() {
    if (!selectedWorkspaceId) {
      return;
    }
    const response = await fetch(`/api/provider-keys?workspaceId=${selectedWorkspaceId}`);
    const body = await response.json();
    if (response.ok) {
      setProviderKeys(body.providerKeys);
    }
  }

  return (
    <>
      <div className="topline">
        <div>
          <p className="eyebrow">Foundation dashboard</p>
          <h1>Production setup</h1>
        </div>
        <span className="status-pill">Phase 1</span>
      </div>

      {notice ? <p className="notice">{notice}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <div className="grid">
        <section className="panel span-4" aria-labelledby="workspace-heading">
          <h2 id="workspace-heading">Workspace</h2>
          <form className="form" onSubmit={createWorkspace}>
            <div className="field">
              <label htmlFor="workspace-name">Workspace name</label>
              <input
                id="workspace-name"
                value={workspaceName}
                onChange={(event) => setWorkspaceName(event.target.value)}
              />
            </div>
            <button className="button" type="submit">
              <Plus size={17} aria-hidden="true" />
              Create workspace
            </button>
          </form>
          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="workspace-select">Current workspace</label>
            <select
              id="workspace-select"
              value={selectedWorkspaceId}
              onChange={(event) => setSelectedWorkspaceId(event.target.value)}
            >
              <option value="">Select workspace</option>
              {workspaces.map((workspace) => (
                <option value={workspace.id} key={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </div>
          {selectedWorkspace ? <p className="meta">Slug: {selectedWorkspace.slug}</p> : null}
        </section>

        <section className="panel span-4" aria-labelledby="project-heading">
          <h2 id="project-heading">Project</h2>
          <form className="form" onSubmit={createProject}>
            <div className="field">
              <label htmlFor="project-title">Project title</label>
              <input
                id="project-title"
                value={projectTitle}
                onChange={(event) => setProjectTitle(event.target.value)}
              />
            </div>
            <button className="button" type="submit">
              <FolderPlus size={17} aria-hidden="true" />
              Create project
            </button>
          </form>
        </section>

        <section className="panel span-4" aria-labelledby="provider-heading">
          <div className="button-row" style={{ justifyContent: "space-between" }}>
            <h2 id="provider-heading">Provider key</h2>
            <button className="button secondary" type="button" onClick={refreshProviderKeys}>
              <RefreshCw size={15} aria-hidden="true" />
              Refresh
            </button>
          </div>
          <form className="form" onSubmit={saveKey}>
            <div className="field">
              <label htmlFor="provider-slug">Provider</label>
              <select
                id="provider-slug"
                value={providerSlug}
                onChange={(event) => setProviderSlug(event.target.value)}
              >
                <option value="openai">OpenAI</option>
                <option value="stability">Stability</option>
                <option value="replicate">Replicate</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="provider-key">API key</label>
              <input
                id="provider-key"
                type="password"
                autoComplete="off"
                placeholder="Paste a provider API key"
                value={providerKey}
                onChange={(event) => setProviderKey(event.target.value)}
              />
            </div>
            <button className="button" type="submit">
              <KeyRound size={17} aria-hidden="true" />
              Save key
            </button>
          </form>
          <ul className="list" style={{ marginTop: 12 }}>
            {providerKeys.map((key) => (
              <li className="list-item" key={key.id}>
                <span>{key.label ?? key.providerSlug}</span>
                <span className="meta">{key.maskedKey}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-12" id="projects" aria-labelledby="projects-heading">
          <h2 id="projects-heading">Projects</h2>
          {projects.length === 0 ? (
            <p className="notice">No projects yet. Create a workspace and project to open the empty project dashboard.</p>
          ) : (
            <ul className="list">
              {projects.map((project) => (
                <li className="list-item" key={project.id}>
                  <div>
                    <h3>{project.title}</h3>
                    <p className="meta">
                      {project.targetFormat} · {project.aspectRatio} · {project.rightsPolicy}
                    </p>
                  </div>
                  <Link className="button secondary" href={`/projects/${project.id}`}>
                    Open dashboard
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
