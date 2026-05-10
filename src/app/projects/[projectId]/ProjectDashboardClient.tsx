"use client";

import { useEffect, useState } from "react";
import { Activity, FileUp, GitBranch, Radio, RefreshCw, Save } from "lucide-react";
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
      setEvents((current) => [
        {
          id: (message as MessageEvent).lastEventId,
          projectId: project.id,
          jobId: data.jobId,
          eventType: data.eventType,
          message: data.message,
          progressPct: data.progressPct,
          createdAt: data.timestamp,
        },
        ...current,
      ]);
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
    const response = await fetch(`/api/projects/${project.id}/assets/${asset.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });
    const body = await response.json();
    if (response.ok) {
      setAnalysisGraph((current) => ({
        ...current,
        assets: current.assets.map((candidate) => (candidate.id === asset.id ? body.asset : candidate)),
      }));
      setNotice(`${asset.canonicalName} approved.`);
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
                    <button className="button secondary" type="button" onClick={() => approveAsset(asset)}>
                      <Save size={15} aria-hidden="true" />
                      Approve
                    </button>
                  </div>
                  <span className="status-pill">{asset.status}</span>
                  <p className="meta">{asset.description}</p>
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
      </div>
    </>
  );
}
