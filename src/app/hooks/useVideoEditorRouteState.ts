import { useLocation, useSearchParams } from 'react-router-dom';

const VIDEO_EDITOR_ROUTE = '/tools/video-editor';

export function isVideoEditorRoute(pathname: string): boolean {
  return pathname === VIDEO_EDITOR_ROUTE || pathname.startsWith(`${VIDEO_EDITOR_ROUTE}/`);
}

export function isVideoEditorShellActiveForLocation(pathname: string, search: string): boolean {
  if (!isVideoEditorRoute(pathname)) return false;
  const searchParams = new URLSearchParams(search);
  return Boolean(
    searchParams.get('timeline'),
  );
}

export function useVideoEditorRouteState() {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const timelineId = searchParams.get('timeline');
  const isEditorRoute = isVideoEditorRoute(pathname);
  const isVideoEditorShellActive = isVideoEditorShellActiveForLocation(
    pathname,
    `?${searchParams.toString()}`,
  );

  return {
    isEditorRoute,
    timelineId,
    isVideoEditorShellActive,
  };
}
