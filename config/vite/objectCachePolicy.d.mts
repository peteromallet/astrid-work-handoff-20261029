export const IMMUTABLE_OBJECT_CACHE_CONTROL: string;
export function isImmutableObjectRead(method: string | undefined, path: string | undefined): boolean;
export function isCacheableObjectStatus(status: number | undefined): boolean;
export function objectCacheControl(method: string | undefined, path: string | undefined, status: number | undefined): string | undefined;
