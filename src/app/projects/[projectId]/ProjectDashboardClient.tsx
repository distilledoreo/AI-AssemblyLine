"use client";

import { useEffect, useState } from "react";
import { Activity, Radio } from "lucide-react";
import type { GenerationJob, JobEvent, Project, ProjectStyle } from "@/server/types";

export function ProjectDashboardClient({
  project,
  style,
  initialJobs,
  initialEvents,
}: Readonly<{
  project: Project;
  style?: ProjectStyle;
  initialJobs: GenerationJob[];
  initialEvents: JobEvent[];
}>) {
  const [connectionState, setConnectionState] = useState("connecting");
  const [events, setEvents] = useState(initialEvents);

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
      </div>
    </>
  );
}
