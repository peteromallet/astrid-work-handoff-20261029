export function getProjectAspectRatioStyle(projectAspectRatio?: string): { aspectRatio: string } {
  if (!projectAspectRatio) {
    return { aspectRatio: '16/9' };
  }

  const [width, height] = projectAspectRatio.split(':').map(Number);
  if (width && height) {
    return { aspectRatio: `${width}/${height}` };
  }

  return { aspectRatio: '16/9' };
}
