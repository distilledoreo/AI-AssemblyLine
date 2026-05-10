import { ProjectWorkflowPage } from "@/app/projects/[projectId]/ProjectWorkflowPage";

export default async function ProjectScriptPage({
  params,
}: Readonly<{ params: Promise<{ projectId: string }> }>) {
  return <ProjectWorkflowPage params={params} view="script" />;
}
