interface HasCreatedAt {
  created_at?: string | null;
  createdAt?: string | null;
}

function toCreatedAtTimestamp(value: HasCreatedAt): number {
  return new Date(value.created_at || value.createdAt || 0).getTime();
}

export function compareByCreatedAtDesc<T extends HasCreatedAt>(a: T, b: T): number {
  return toCreatedAtTimestamp(b) - toCreatedAtTimestamp(a);
}

export function compareByCreatedAtAsc<T extends HasCreatedAt>(a: T, b: T): number {
  return toCreatedAtTimestamp(a) - toCreatedAtTimestamp(b);
}
