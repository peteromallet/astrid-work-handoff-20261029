export function astridProjectCollectionPath(): string {
  return '/v1/projects';
}

export function astridTimelineCollectionPath(projectSlug: string): string {
  return `/v1/projects/${encodeURIComponent(projectSlug)}/timelines`;
}

export function astridObjectContentPath(_projectSlug: string, objectRef: string): string {
  return `/v1/objects/${encodeURIComponent(objectRef)}`;
}
