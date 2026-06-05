"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StoryboardMarkupCanvas } from "@/app/projects/[projectId]/StoryboardMarkupCanvas";
import { formatOperationsLoadError } from "@/app/projects/[projectId]/operationsStatus";
import { Activity, Archive, Brush, FileUp, Film, Gauge, GitBranch, HardDrive, Images, Lock, Radio, RefreshCw, Save, Sparkles } from "lucide-react";
import type {
  Asset,
  ExportBundle,
  GenerationJob,
  JobEvent,
  Project,
  ProjectStyle,
  Scene,
  ScriptAnalysisGraph,
  Shot,
  StorageUsage,
} from "@/server/types";

const sampleScript = `INT. COFFEE SHOP - MORNING
ANNA
I thought you were never coming.
David holds a brass key and scans the room.

EXT. ALLEY - NIGHT
Anna follows David through rain and neon.
Close on the brass key in her hand.`;

type OperationsPayload = {
  bundles: ExportBundle[];
  storage: StorageUsage;
  metrics: {
    totalJobs: number;
    jobsByStatus: Record<string, number>;
    jobsByType: Record<string, number>;
    queueHealth: Array<{
      name: string;
      active: number;
      waiting: number;
      delayed?: number;
      failed: number;
      completed?: number;
      rateLimit?: { max: number; duration: number };
      redisBacked: boolean;
      healthError?: string;
      latestFailures?: Array<{
        id: string;
        name: string;
        failedReason?: string;
        attemptsMade?: number;
        finishedAt?: string;
      }>;
    }>;
    sentryEnabled: boolean;
  };
  adapters: Array<{
    slug: string;
    capabilities: { models?: string[]; maxDurationSeconds?: number };
    productionReady?: boolean;
    executionMode?: string;
    note?: string;
  }>;
};

export type ProjectDashboardView = "overview" | "script" | "asset-bible" | "storyboard" | "video";

export function ProjectDashboardClient({
  project,
  style,
  initialJobs,
  initialEvents,
  initialAnalysisGraph,
  currentUserId,
  view = "overview",
}: Readonly<{
  project: Project;
  style?: ProjectStyle;
  initialJobs: GenerationJob[];
  initialEvents: JobEvent[];
  initialAnalysisGraph: ScriptAnalysisGraph;
  currentUserId: string;
  view?: ProjectDashboardView;
}>) {
  const [connectionState, setConnectionState] = useState("connecting");
  const [events, setEvents] = useState(initialEvents);
  const [analysisGraph, setAnalysisGraph] = useState(initialAnalysisGraph);
  const [scriptText, setScriptText] = useState(sampleScript);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [operations, setOperations] = useState<OperationsPayload | null>(null);
  const [operationsError, setOperationsError] = useState("");

  useEffect(() => {
    const source = new EventSource(`/api/projects/${project.id}/events`);
    source.addEventListener("connected", () => setConnectionState("live"));
    source.addEventListener("status_change", (message) => {
      const data = JSON.parse((message as MessageEvent).data);
      setEvents((current) => {
        if (current.some((event) => event.id === (message as MessageEvent).lastEventId)) {
          return current;
        }
        return [{
          id: (message as MessageEvent).lastEventId,
          projectId: project.id,
          jobId: data.jobId,
          eventType: data.eventType,
          message: data.message,
          progressPct: data.progressPct,
          createdAt: data.timestamp,
        },
        ...current];
      });
    });
    source.onerror = () => setConnectionState("reconnecting");
    return () => source.close();
  }, [project.id]);

  useEffect(() => {
    fetch(`/api/projects/${project.id}/operations`)
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(formatOperationsLoadError(response.status, body?.error?.message));
        }
        return response.json();
      })
      .then((body) => {
        setOperations(body);
        setOperationsError("");
      })
      .catch((loadError) => {
        setOperations(null);
        const message = loadError instanceof Error ? loadError.message : "Request failed.";
        setOperationsError(message.startsWith("Operations panel unavailable.") ? message : formatOperationsLoadError(undefined, message));
      });
  }, [project.id]);

  async function uploadScript() {
    setNotice("");
    setError("");
    const response = await fetch(`/api/projects/${project.id}/scripts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: "phase-2-script.txt", text: scriptText }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error?.message ?? "Script analysis failed.");
      return;
    }
    setAnalysisGraph(body);
    setNotice("Script uploaded and analyzed.");
  }

  async function reanalyze() {
    setNotice("");
    setError("");
    const response = await fetch(`/api/projects/${project.id}/scripts`, { method: "PATCH" });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error?.message ?? "Re-analysis failed.");
      return;
    }
    setAnalysisGraph(body);
    setNotice("Re-analysis complete with user edits preserved.");
  }

  async function saveScene(scene: Scene, summary: string) {
    const response = await fetch(`/api/projects/${project.id}/scenes/${scene.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary }),
    });
    const body = await response.json();
    if (response.ok) {
      setAnalysisGraph((current) => ({
        ...current,
        scenes: current.scenes.map((candidate) => (candidate.id === scene.id ? body.scene : candidate)),
      }));
      setNotice("Scene edit saved.");
    }
  }

  async function saveShot(shot: Shot, userDirection: string) {
    const response = await fetch(`/api/projects/${project.id}/shots/${shot.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userDirection }),
    });
    const body = await response.json();
    if (response.ok) {
      setAnalysisGraph((current) => ({
        ...current,
        shots: current.shots.map((candidate) => (candidate.id === shot.id ? body.shot : candidate)),
      }));
      setNotice("Shot direction saved.");
    }
  }

  async function approveAsset(asset: Asset) {
    await assetBibleAction({ action: "status", assetId: asset.id, status: "approved" });
    setNotice(`${asset.canonicalName} approved.`);
  }

  async function assetBibleAction(payload: unknown) {
    const response = await fetch(`/api/projects/${project.id}/asset-bible`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (response.ok) {
      setAnalysisGraph(body);
    } else {
      setError(body.error?.message ?? "Asset Bible action failed.");
    }
  }

  async function storyboardAction(payload: unknown) {
    const response = await fetch(`/api/projects/${project.id}/storyboards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (response.ok) {
      setAnalysisGraph(body);
      setNotice("Storyboard updated.");
    } else {
      setError(body.error?.message ?? "Storyboard action failed.");
    }
  }

  async function videoAction(payload: unknown) {
    const response = await fetch(`/api/projects/${project.id}/videos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (response.ok) {
      setAnalysisGraph(body);
      setNotice("Video workflow updated.");
    } else {
      setError(body.error?.message ?? "Video action failed.");
    }
  }

  async function collaborationAction(payload: unknown) {
    const response = await fetch(`/api/projects/${project.id}/collaboration`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (response.ok) {
      setAnalysisGraph(body);
      setNotice(body.inviteToken ? `Invitation created. Token: ${body.inviteToken}` : "Collaboration updated.");
    } else {
      setError(body.error?.message ?? "Collaboration action failed.");
    }
  }

  async function operationsAction(payload: unknown) {
    setNotice("");
    setError("");
    const response = await fetch(`/api/projects/${project.id}/operations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (response.ok) {
      setOperations(body);
      if (body.graph) setAnalysisGraph(body.graph);
      setNotice(
        body.export?.manifestPath
          ? `Export complete: ${body.export.manifestPath}`
          : body.export?.job
            ? "Export queued."
          : body.import?.project?.title
            ? `Import complete: ${body.import.project.title}`
            : body.import?.job
              ? "Import queued."
            : "Project operations updated.",
      );
    } else {
      setError(body.error?.message ?? "Project operation failed.");
    }
  }

  const show = (target: ProjectDashboardView) => view === "overview" || view === target;
  const workflowLinks: Array<{ href: string; label: string; target: ProjectDashboardView }> = [
    { href: `/projects/${project.id}`, label: "Overview", target: "overview" },
    { href: `/projects/${project.id}/script`, label: "Script", target: "script" },
    { href: `/projects/${project.id}/asset-bible`, label: "Asset Bible", target: "asset-bible" },
    { href: `/projects/${project.id}/storyboard`, label: "Storyboard", target: "storyboard" },
    { href: `/projects/${project.id}/video`, label: "Video", target: "video" },
  ];

  return (
    <>
      <div className="topline">
        <div>
          <p className="eyebrow">Project dashboard</p>
          <h1>{project.title}</h1>
        </div>
          <span className={`status-pill ${connectionState === "live" ? "live" : ""}`}>
          <Radio size={13} aria-hidden="true" /> SSE {connectionState}
        </span>
      </div>
      <nav aria-label="Project workflow" className="button-row" style={{ marginBottom: 16 }}>
        {workflowLinks.map((link) => (
          <Link
            aria-current={view === link.target ? "page" : undefined}
            className={`button secondary ${view === link.target ? "live" : ""}`}
            href={link.href}
            key={link.href}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      {notice ? <p className="notice">{notice}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <div className="grid">
        <section className="panel span-6" hidden={!show("overview")} aria-labelledby="overview-heading">
          <h2 id="overview-heading">Overview</h2>
          <ul className="list">
            <li className="list-item">
              <span>Target format</span>
              <span className="meta">{project.targetFormat}</span>
            </li>
            <li className="list-item">
              <span>Aspect ratio</span>
              <span className="meta">{project.aspectRatio}</span>
            </li>
            <li className="list-item">
              <span>Generation mode</span>
              <span className="meta">{project.generationMode === "local" ? "Local Mode" : "Cloud Mode"}</span>
            </li>
            <li className="list-item">
              <span>Rights policy</span>
              <span className="meta">{project.rightsPolicy}</span>
            </li>
            <li className="list-item">
              <span>Storage path</span>
              <span className="meta">{project.storagePath}</span>
            </li>
          </ul>
        </section>

        <section className="panel span-6" hidden={!show("overview")} aria-labelledby="style-heading">
          <h2 id="style-heading">Project style</h2>
          {style ? (
            <ul className="list">
              <li className="list-item">
                <span>{style.styleName}</span>
                <span className="status-pill">{style.approvalStatus}</span>
              </li>
              <li className="notice">{style.description}</li>
            </ul>
          ) : (
            <p className="notice">No style record found.</p>
          )}
        </section>

        <section className="panel span-6" hidden={!show("overview")} aria-labelledby="jobs-heading">
          <h2 id="jobs-heading">Jobs</h2>
          {initialJobs.length === 0 ? (
            <p className="notice">No jobs have been queued yet.</p>
          ) : (
            <ul className="list">
              {initialJobs.map((job) => (
                <li className="list-item" key={job.id}>
                  <span>{job.type}</span>
                  <span className="status-pill">{job.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel span-6" hidden={!show("overview")} aria-labelledby="events-heading">
          <h2 id="events-heading">
            <Activity size={17} aria-hidden="true" /> Live events
          </h2>
          {events.length === 0 ? (
            <p className="notice">SSE is connected. New job events will appear here.</p>
          ) : (
            <ul className="list">
              {events.map((event) => (
                <li className="list-item" key={event.id}>
                  <span>{event.message ?? event.eventType}</span>
                  <span className="meta">{event.progressPct ?? 0}%</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel span-12" hidden={!show("script")} aria-labelledby="script-heading">
          <div className="button-row" style={{ justifyContent: "space-between" }}>
            <h2 id="script-heading">Script analysis</h2>
            <div className="button-row">
              <button className="button secondary" type="button" onClick={reanalyze}>
                <RefreshCw size={16} aria-hidden="true" />
                Re-analyze
              </button>
              <button className="button" type="button" onClick={uploadScript}>
                <FileUp size={16} aria-hidden="true" />
                Upload and analyze
              </button>
            </div>
          </div>
          <textarea
            aria-label="Script text"
            value={scriptText}
            onChange={(event) => setScriptText(event.target.value)}
            rows={7}
          />
          <p className="meta">
            Active version: {analysisGraph.activeVersion?.versionNumber ?? "none"} · Scenes:{" "}
            {analysisGraph.scenes.length} · Shots: {analysisGraph.shots.length} · Assets:{" "}
            {analysisGraph.assets.length}
          </p>
        </section>

        <section className="panel span-6" hidden={!show("script")} aria-labelledby="scene-list-heading">
          <h2 id="scene-list-heading">Scenes and shots</h2>
          {analysisGraph.scenes.length === 0 ? (
            <p className="notice">Upload a script to create the editable scene and shot breakdown.</p>
          ) : (
            <ul className="list">
              {analysisGraph.scenes.map((scene) => (
                <li className="list-item column" key={scene.id}>
                  <div className="button-row" style={{ justifyContent: "space-between" }}>
                    <strong>
                      {scene.sceneNumber}. {scene.heading}
                    </strong>
                    <span className="status-pill">{scene.status}</span>
                  </div>
                  <textarea
                    aria-label={`Summary for ${scene.heading}`}
                    defaultValue={scene.summary}
                    rows={2}
                    onBlur={(event) => saveScene(scene, event.currentTarget.value)}
                  />
                  {analysisGraph.shots
                    .filter((shot) => shot.sceneId === scene.id)
                    .map((shot) => (
                      <div className="subitem" key={shot.id}>
                        <span>
                          Shot {shot.shotNumber}: {shot.action}
                        </span>
                        <input
                          aria-label={`Direction for shot ${shot.shotNumber}`}
                          placeholder="User direction"
                          defaultValue={shot.userDirection ?? ""}
                          onBlur={(event) => saveShot(shot, event.currentTarget.value)}
                        />
                      </div>
                    ))}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel span-6" hidden={!show("script")} aria-labelledby="asset-list-heading">
          <h2 id="asset-list-heading">Assets and requirements</h2>
          {analysisGraph.assets.length === 0 ? (
            <p className="notice">Detected characters, locations, wardrobe, creatures, and props appear here.</p>
          ) : (
            <ul className="list">
              {analysisGraph.assets.map((asset) => (
                <li className="list-item column" key={asset.id}>
                  <div className="button-row" style={{ justifyContent: "space-between" }}>
                    <span>
                      {asset.canonicalName} <span className="meta">({asset.type})</span>
                    </span>
                    <div className="button-row">
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() =>
                          assetBibleAction({ action: "generate", assetId: asset.id, providerSlug: "stability" })
                        }
                      >
                        <Sparkles size={15} aria-hidden="true" />
                        {project.generationMode === "local" ? "Generate local" : "Generate"}
                      </button>
                      <button className="button secondary" type="button" onClick={() => approveAsset(asset)}>
                        <Save size={15} aria-hidden="true" />
                        Approve
                      </button>
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() => assetBibleAction({ action: "status", assetId: asset.id, status: "locked" })}
                      >
                        <Lock size={15} aria-hidden="true" />
                        Lock
                      </button>
                    </div>
                  </div>
                  <span className="status-pill">{asset.status}</span>
                  <textarea
                    aria-label={`Continuity notes for ${asset.canonicalName}`}
                    defaultValue={asset.continuityNotes ?? asset.description ?? ""}
                    rows={2}
                    onBlur={(event) =>
                      assetBibleAction({
                        action: "detail",
                        assetId: asset.id,
                        detail: {
                          narrativeDescription: event.currentTarget.value,
                          physicalDescription: event.currentTarget.value,
                        },
                      })
                    }
                  />
                  <p className="meta">
                    {analysisGraph.assetVersions.filter((version) => version.assetId === asset.id).length} versions ·{" "}
                    {
                      analysisGraph.assetReferences.filter((reference) =>
                        analysisGraph.assetVersions.some(
                          (version) => version.id === reference.assetVersionId && version.assetId === asset.id,
                        ),
                      ).length
                    }{" "}
                    references
                  </p>
                </li>
              ))}
            </ul>
          )}
          <div className="dependency-summary">
            <GitBranch size={17} aria-hidden="true" />
            {analysisGraph.sceneAssetRequirements.length} scene links ·{" "}
            {analysisGraph.shotAssetRequirements.length} shot links
          </div>
        </section>

        <section className="panel span-12" hidden={!show("asset-bible")} aria-labelledby="asset-bible-heading">
          <div className="button-row" style={{ justifyContent: "space-between" }}>
            <h2 id="asset-bible-heading">Asset Bible lifecycle</h2>
            <span className="status-pill">
              <Images size={14} aria-hidden="true" /> {analysisGraph.assetReferences.length} references
            </span>
          </div>
          <div className="dependency-summary">
            Scenes ready: {analysisGraph.scenes.filter((scene) => scene.status === "ready").length}/
            {analysisGraph.scenes.length} · Shots ready:{" "}
            {analysisGraph.shots.filter((shot) => ["ready", "storyboarded", "video_ready", "complete"].includes(shot.status)).length}/
            {analysisGraph.shots.length}
          </div>
          <p className="meta">
            Generate references only on request, review them as versions, then approve or lock assets to unlock
            dependent scenes and shots.
          </p>
        </section>

        <section className="panel span-12" hidden={!show("storyboard")} aria-labelledby="storyboard-heading">
          <div className="button-row" style={{ justifyContent: "space-between" }}>
            <h2 id="storyboard-heading">Storyboard frames</h2>
            <span className="status-pill">
              <Brush size={14} aria-hidden="true" /> {analysisGraph.frameVersions.length} versions
            </span>
          </div>
          <ul className="list">
            {analysisGraph.shots.map((shot) => {
              const frame = analysisGraph.storyboardFrames.find((candidate) => candidate.shotId === shot.id);
              const versions = frame
                ? analysisGraph.frameVersions.filter((version) => version.frameId === frame.id)
                : [];
              const latest = versions.at(-1);
              return (
                <li className="list-item column" key={shot.id}>
                  <div className="button-row" style={{ justifyContent: "space-between" }}>
                    <span>
                      Shot {shot.shotNumber}: {shot.action}
                    </span>
                    <div className="button-row">
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() => storyboardAction({ action: "generate", shotId: shot.id, keyframeIndex: 0 })}
                      >
                        <Sparkles size={15} aria-hidden="true" />
                        {project.generationMode === "local" ? "Generate local frame" : "Generate frame"}
                      </button>
                      {latest ? (
                        <>
                          <button
                            className="button secondary"
                            type="button"
                            onClick={() =>
                              storyboardAction({
                                action: "comment",
                                frameVersionId: latest.id,
                                body: "Frame composition reviewed.",
                              })
                            }
                          >
                            Comment
                          </button>
                          <button
                            className="button secondary"
                            type="button"
                            onClick={() =>
                              storyboardAction({
                                action: "frame",
                                frameVersionId: latest.id,
                                status: "approved",
                              })
                            }
                          >
                            <Save size={15} aria-hidden="true" />
                            Approve frame
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <p className="meta">
                    {versions.length} versions · latest {latest?.status ?? "not generated"}
                    {latest?.isStale ? " · stale" : ""}
                  </p>
                  {latest ? (
                    <StoryboardMarkupCanvas
                      initialAnnotations={latest.annotations}
                      onSave={(annotations) =>
                        storyboardAction({
                          action: "frame",
                          frameVersionId: latest.id,
                          annotations,
                        })
                      }
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
          <div className="dependency-summary">
            Approved frames: {analysisGraph.frameVersions.filter((version) => version.status === "approved").length} ·
            Comments: {analysisGraph.reviewNotes.length}
          </div>
        </section>

        <section className="panel span-12" hidden={!show("video")} aria-labelledby="video-heading">
          <div className="button-row" style={{ justifyContent: "space-between" }}>
            <h2 id="video-heading">Video clips</h2>
            <span className="status-pill">
              <Film size={14} aria-hidden="true" /> {analysisGraph.clipVersions.length} versions
            </span>
          </div>
          <ul className="list">
            {analysisGraph.shots.map((shot) => {
              const clip = analysisGraph.videoClips.find((candidate) => candidate.shotId === shot.id);
              const versions = clip ? analysisGraph.clipVersions.filter((version) => version.clipId === clip.id) : [];
              const latest = versions.at(-1);
              return (
                <li className="list-item column" key={shot.id}>
                  <div className="button-row" style={{ justifyContent: "space-between" }}>
                    <span>Shot {shot.shotNumber} clip</span>
                    <div className="button-row">
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() =>
                          videoAction({ action: "generate", mode: "shot", shotId: shot.id, providerSlug: "runway" })
                        }
                      >
                        <Film size={15} aria-hidden="true" />
                        {project.generationMode === "local" ? "Generate local" : "Generate Runway"}
                      </button>
                      <button
                        className="button secondary"
                        type="button"
                        hidden={project.generationMode === "local"}
                        onClick={() =>
                          videoAction({ action: "generate", mode: "shot", shotId: shot.id, providerSlug: "google-ai" })
                        }
                      >
                        <Film size={15} aria-hidden="true" />
                        Generate Veo
                      </button>
                      {latest ? (
                        <button
                          className="button secondary"
                          type="button"
                          onClick={() => videoAction({ action: "clip", clipVersionId: latest.id, status: "approved" })}
                        >
                          <Save size={15} aria-hidden="true" />
                          Approve clip
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <p className="meta">
                    {versions.length} versions · latest {latest?.status ?? "not generated"}
                    {latest?.isStale ? " · stale" : ""}
                  </p>
                </li>
              );
            })}
          </ul>
          <div className="button-row" style={{ marginTop: 12 }}>
            {analysisGraph.scenes.map((scene) => (
              <button
                className="button secondary"
                key={scene.id}
                type="button"
                onClick={() => videoAction({ action: "generate", mode: "scene", sceneId: scene.id, providerSlug: "runway" })}
              >
                <Film size={15} aria-hidden="true" />
                {project.generationMode === "local" ? "Local scene" : "Runway scene"} {scene.sceneNumber}
              </button>
            ))}
            {analysisGraph.scenes.map((scene) => (
              <button
                className="button secondary"
                key={`${scene.id}-google-ai`}
                type="button"
                hidden={project.generationMode === "local"}
                onClick={() => videoAction({ action: "generate", mode: "scene", sceneId: scene.id, providerSlug: "google-ai" })}
              >
                <Film size={15} aria-hidden="true" />
                Veo scene {scene.sceneNumber}
              </button>
            ))}
          </div>
          <div className="dependency-summary">
            Approved clips: {analysisGraph.clipVersions.filter((version) => version.status === "approved").length}
          </div>
        </section>

        <section className="panel span-12" hidden={!show("overview")} aria-labelledby="collaboration-heading">
          <div className="button-row" style={{ justifyContent: "space-between" }}>
            <h2 id="collaboration-heading">Collaboration</h2>
            <span className="status-pill">{analysisGraph.assignments.length} assignments</span>
          </div>
          <div className="button-row">
            <button
              className="button secondary"
              type="button"
              onClick={() => collaborationAction({ action: "invite", email: "artist@example.com", role: "artist" })}
            >
              Invite artist
            </button>
            {analysisGraph.scenes[0] ? (
              <button
                className="button secondary"
                type="button"
                onClick={() =>
                  collaborationAction({
                    action: "assign",
                    userId: currentUserId,
                    targetType: "scene",
                    sceneId: analysisGraph.scenes[0].id,
                  })
                }
              >
                Assign scene 1
              </button>
            ) : null}
          </div>
          <ul className="list" style={{ marginTop: 12 }}>
            {analysisGraph.activityEvents.slice(-5).map((activity) => (
              <li className="list-item" key={activity.id}>
                <span>{activity.message}</span>
                <span className="meta">{activity.eventType}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel span-12" hidden={!show("overview")} aria-labelledby="operations-heading">
          <div className="button-row" style={{ justifyContent: "space-between" }}>
            <h2 id="operations-heading">Export and operations</h2>
            <span className="status-pill">
              <Gauge size={14} aria-hidden="true" /> {operations?.metrics.totalJobs ?? analysisGraph.jobs.length} jobs
            </span>
          </div>
          <div className="button-row">
            <button
              aria-label="Export complete project bundle"
              className="button secondary"
              type="button"
              onClick={() => operationsAction({ action: "export" })}
            >
              <Archive size={15} aria-hidden="true" />
              Export bundle
            </button>
            {operations?.bundles.at(-1) ? (
              <button
                aria-label="Import latest exported project bundle into a new project"
                className="button secondary"
                type="button"
                onClick={() => operationsAction({ action: "import", manifestPath: operations.bundles.at(-1)?.manifestPath })}
              >
                <Archive size={15} aria-hidden="true" />
                Import latest
              </button>
            ) : null}
            <button
              aria-label="Clear generated thumbnail cache"
              className="button secondary"
              type="button"
              onClick={() => operationsAction({ action: "clear_thumbnails" })}
            >
              <HardDrive size={15} aria-hidden="true" />
              Clear thumbnails
            </button>
          </div>
          <ul className="list" style={{ marginTop: 12 }}>
            <li className="list-item">
              <span>Bundle version</span>
              <span className="meta">{operations?.bundles.at(-1)?.bundleVersion ?? 1}</span>
            </li>
            <li className="list-item">
              <span>Storage</span>
              <span className="meta">
                {operationsError || (operations ? `${operations.storage.fileCount} files · ${operations.storage.warningLevel}` : "calculating")}
              </span>
            </li>
            <li className="list-item">
              <span>Orphans</span>
              <span className="meta">{operations?.storage.orphanFiles.length ?? 0}</span>
            </li>
            <li className="list-item">
              <span>Sentry</span>
              <span className="meta">{operations?.metrics.sentryEnabled ? "enabled" : "disabled"}</span>
            </li>
            <li className="list-item column">
              <span>Queue health</span>
              {operations?.metrics.queueHealth?.length ? (
                <ul className="list compact-list">
                  {operations.metrics.queueHealth.map((queue) => (
                    <li className="list-item" key={queue.name}>
                      <span>{queue.name}</span>
                      <span className="meta">
                        {queue.redisBacked ? "Redis" : "inline"} · active {queue.active} · waiting {queue.waiting} ·
                        delayed {queue.delayed ?? 0} · failed {queue.failed}
                        {queue.rateLimit ? ` · limit ${queue.rateLimit.max}/${Math.round(queue.rateLimit.duration / 1000)}s` : ""}
                        {queue.healthError ? ` · health error: ${queue.healthError}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="meta">loading</span>
              )}
            </li>
            {operations?.metrics.queueHealth?.some((queue) => (queue.latestFailures?.length ?? 0) > 0) ? (
              <li className="list-item column">
                <span>Recent queue failures</span>
                <ul className="list compact-list">
                  {operations.metrics.queueHealth.flatMap((queue) =>
                    (queue.latestFailures ?? []).map((failure) => (
                      <li className="list-item" key={`${queue.name}-${failure.id}`}>
                        <span>
                          {queue.name}: {failure.name}
                        </span>
                        <span className="meta">
                          {failure.failedReason ?? "failed"} · attempts {failure.attemptsMade ?? 0}
                        </span>
                      </li>
                    )),
                  )}
                </ul>
              </li>
            ) : null}
            <li className="list-item">
              <span>Development-only adapter snapshots</span>
              <span className="meta">
                {operations?.adapters
                  .map((adapter) => `${adapter.slug} (${adapter.productionReady ? "production-ready" : "development-only"})`)
                  .join(", ") ?? "loading"}
              </span>
            </li>
          </ul>
        </section>
      </div>
    </>
  );
}
