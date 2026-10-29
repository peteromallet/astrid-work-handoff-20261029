import { useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card.tsx';
import { useRuntimeEditorDiscovery, chooseRuntimeTimeline } from '@/tools/video-editor/hooks/useRuntimeEditorDiscovery.ts';
import { LocalTimelineShotBrowser } from './LocalTimelineShotBrowser.tsx';

/** Travel consumes the canonical editor selection and opens its Runtime timeline. */
export function AstridTravelRoute() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const projectRef = searchParams.get('project')?.trim() || null;
  const timelineRef = searchParams.get('timeline')?.trim() || null;
  const discovery = useRuntimeEditorDiscovery({ enabled: true, projectId: projectRef, open: true });
  const project = discovery.project;
  const timelines = discovery.timelinesQuery.data ?? [];
  const selectedTimeline = timelines.find((t) => t.timeline_id === timelineRef) ?? null;
  const defaultTimeline = project ? chooseRuntimeTimeline(project, timelines) : undefined;
  const activeTimeline = selectedTimeline ?? (!timelineRef ? defaultTimeline : null);

  useEffect(() => {
    const projectId = project?.project_id;
    const timelineId = activeTimeline?.timeline_id;
    if (!projectId || !timelineId) return;
    const nextSearchParams = new URLSearchParams(location.search);
    nextSearchParams.set('project', projectId);
    nextSearchParams.set('timeline', timelineId);
    const search = `?${nextSearchParams.toString()}`;
    if (search === location.search) return;
    navigate({ ...location, search }, { replace: true });
  }, [activeTimeline?.timeline_id, location, navigate, project?.project_id]);

  if (project && activeTimeline) {
    return <LocalTimelineShotBrowser projectSlug={project.slug} projectId={project.project_id} timelineRef={activeTimeline.timeline_id} />;
  }

  let title = 'Select an Astrid project';
  let description = 'Choose a project from the header to open its primary timeline.';
  if (discovery.projectsQuery.isLoading) {
    title = 'Loading Astrid projects';
    description = 'Connecting to the local Astrid workspace…';
  } else if (discovery.projectsQuery.error) {
    title = 'Astrid is unavailable';
    description = discovery.projectsQuery.error.message;
  } else if (projectRef && !project) {
    title = 'Astrid project not found';
    description = `No project matching “${projectRef}” was returned by the Runtime.`;
  } else if (project && discovery.timelinesQuery.isLoading) {
    title = 'Loading project timelines';
    description = 'Finding the primary timeline for this Astrid project…';
  } else if (project && timelineRef && !selectedTimeline) {
    title = 'Astrid timeline not found';
    description = `No timeline matching “${timelineRef}” was returned for this project.`;
  } else if (project && !timelines.length && !discovery.timelinesQuery.error) {
    title = 'No timelines in this project';
    description = 'Create a timeline in the video editor, then return here.';
  } else if (discovery.timelinesQuery.error) {
    title = 'Unable to load project timelines';
    description = discovery.timelinesQuery.error.message;
  }
  return (
    <div className="flex h-full min-h-0 items-center justify-center px-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {discovery.projectsQuery.error && <AlertCircle className="h-4 w-4 text-destructive" />}
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
