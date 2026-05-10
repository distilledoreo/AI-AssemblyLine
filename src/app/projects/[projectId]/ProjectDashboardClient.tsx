"use client";

import { useEffect, useState } from "react";
import { Activity, Brush, FileUp, Film, GitBranch, Images, Lock, Radio, RefreshCw, Save, Sparkles } from "lucide-react";
import type {
  Asset,
  GenerationJob,
  JobEvent,
  Project,
  ProjectStyle,
  Scene,
  ScriptAnalysisGraph,
  Shot,
} from "@/server/types";

const sampleScript = `INT. COFFEE SHOP - MORNING
ANNA
I thought you were never coming.
David holds a brass key and scans the room.

EXT. ALLEY - NIGHT
Anna follows David through rain and neon.
Close on the brass key in her hand.`;

export function ProjectDashboardClient({
  project,
  style,
  initialJobs,
  initialEvents,
  initialAnalysisGraph,
}: Readonly<{
  project: Project;
  style?: ProjectStyle;
  initialJobs: GenerationJob[];
  initialEvents: JobEvent[];
  initialAnalysisGraph: ScriptAnalysisGraph;
}>) {
  const [connectionState, setConnectionState] = useState("connecting");
  const [events, setEvents] = useState(initialEvents);
  const [analysisGraph, setAnalysisGraph] = useState(initialAnalysisGraph);
  const [scriptText, setScriptText] = useState(sampleScript);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

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
      {notice ? <p className="notice">{notice}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <div className="grid">
        <section className="panel span-6" aria-labelledby="overview-heading">
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
              <span>Rights policy</span>
              <span className="meta">{project.rightsPolicy}</span>
            </li>
            <li className="list-item">
              <span>Storage path</span>
              <span className="meta">{project.storagePath}</span>
            </li>
          </ul>
        </section>

        <section className="panel span-6" aria-labelledby="style-heading">
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

        <section className="panel span-6" aria-labelledby="jobs-heading">
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

        <section className="panel span-6" aria-labelledby="events-heading">
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

        <section className="panel span-12" aria-labelledby="script-heading">
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

        <section className="panel span-6" aria-labelledby="scene-list-heading">
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

        <section className="panel span-6" aria-labelledby="asset-list-heading">
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
                        Generate
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

        <section className="panel span-12" aria-labelledby="asset-bible-heading">
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

        <section className="panel span-12" aria-labelledby="storyboard-heading">
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
                        Generate frame
                      </button>
                      {latest ? (
                        <>
                          <button
                            className="button secondary"
                            type="button"
                            onClick={() =>
                              storyboardAction({
                                action: "frame",
                                frameVersionId: latest.id,
                                annotations: {
                                  library: "fabric-compatible-json",
                                  objects: [{ type: "rect", left: 24, top: 24, width: 160, height: 90 }],
                                },
                              })
                            }
                          >
                            <Brush size={15} aria-hidden="true" />
                            Mark up
                          </button>
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
                </li>
              );
            })}
          </ul>
          <div className="dependency-summary">
            Approved frames: {analysisGraph.frameVersions.filter((version) => version.status === "approved").length} ·
            Comments: {analysisGraph.reviewNotes.length}
          </div>
        </section>

        <section className="panel span-12" aria-labelledby="video-heading">
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
                        Generate clip
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
                onClick={() => videoAction({ action: "generate", mode: "scene", sceneId: scene.id, providerSlug: "kling" })}
              >
                <Film size={15} aria-hidden="true" />
                Generate scene {scene.sceneNumber}
              </button>
            ))}
          </div>
          <div className="dependency-summary">
            Approved clips: {analysisGraph.clipVersions.filter((version) => version.status === "approved").length}
          </div>
        </section>
      </div>
    </>
  );
}
