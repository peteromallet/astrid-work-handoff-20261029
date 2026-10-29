/** Map a timeline time to an existing composition frame, rounding to nearest. */
export function timelineSecondsToFrame(
  seconds: number,
  fps: number,
  durationInFrames: number,
): number | null {
  if (!Number.isFinite(seconds) || seconds < 0 || !Number.isFinite(fps) || fps <= 0
    || !Number.isInteger(durationInFrames) || durationInFrames <= 0) return null;
  const durationSeconds = durationInFrames / fps;
  if (seconds >= durationSeconds) return null;
  return Math.min(durationInFrames - 1, Math.round(seconds * fps));
}

/** Small LRU whose contents belong to one immutable revision identity. */
export class FramePreviewCache<T> {
  private revision: object | null = null;
  private readonly entries = new Map<number, T>();

  constructor(private readonly capacity = 16) {
    if (!Number.isInteger(capacity) || capacity <= 0) throw new RangeError('capacity must be a positive integer');
  }

  get(revision: object, frame: number): T | undefined {
    this.useRevision(revision);
    const value = this.entries.get(frame);
    if (value === undefined) return undefined;
    this.entries.delete(frame);
    this.entries.set(frame, value);
    return value;
  }

  set(revision: object, frame: number, value: T): void {
    this.useRevision(revision);
    this.entries.delete(frame);
    this.entries.set(frame, value);
    if (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!);
  }

  clear(): void {
    this.revision = null;
    this.entries.clear();
  }

  private useRevision(revision: object): void {
    if (revision === this.revision) return;
    this.revision = revision;
    this.entries.clear();
  }
}

/** Clone a composed preview subtree while freezing its decoded canvas/video frames. */
export function cloneFrame(root: HTMLElement): HTMLElement | null {
  const clone = root.cloneNode(false) as HTMLElement;
  const copyChildren = (source: Node, target: Node): boolean => {
    for (const child of [...source.childNodes]) {
      if (child instanceof HTMLAudioElement) continue;
      if (child instanceof HTMLVideoElement) {
        if (child.seeking || child.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !child.videoWidth || !child.videoHeight) return false;
        const canvas = root.ownerDocument.createElement('canvas');
        canvas.width = child.videoWidth;
        canvas.height = child.videoHeight;
        canvas.className = child.className;
        canvas.style.cssText = child.style.cssText;
        try { canvas.getContext('2d')?.drawImage(child, 0, 0, canvas.width, canvas.height); } catch { return false; }
        if (!canvas.getContext('2d')) return false;
        target.appendChild(canvas);
        continue;
      }
      const copied = child.cloneNode(false);
      target.appendChild(copied);
      if (child instanceof HTMLCanvasElement) {
        const copiedCanvas = copied as HTMLCanvasElement;
        try { copiedCanvas.getContext('2d')?.drawImage(child, 0, 0); } catch { return false; }
        if (!copiedCanvas.getContext('2d')) return false;
      }
      if (child instanceof HTMLImageElement && (!child.complete || child.naturalWidth === 0)) return false;
      if (!copyChildren(child, copied)) return false;
    }
    return true;
  };
  return copyChildren(root, clone) ? clone : null;
}
