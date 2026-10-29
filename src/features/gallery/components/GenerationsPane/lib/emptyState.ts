export type EmptyStateMediaType = 'all' | 'image' | 'video' | 'audio';

export type EmptyStateShotScope =
  | { kind: 'all' }
  | { kind: 'none' }
  | { kind: 'shot'; name?: string };

export interface EmptyStateInput {
  mediaType: EmptyStateMediaType;
  starredOnly: boolean;
  searchTerm: string;
  shotScope: EmptyStateShotScope;
}

export interface EmptyStateDescription {
  message: string;
  hasActiveFilters: boolean;
}

const TYPE_NOUN: Record<Exclude<EmptyStateMediaType, 'all'>, string> = {
  image: 'images',
  video: 'videos',
  audio: 'audio',
};

const TYPE_TITLE: Record<Exclude<EmptyStateMediaType, 'all'>, string> = {
  image: 'Images',
  video: 'Videos',
  audio: 'Audio',
};

function describeScope(scope: EmptyStateShotScope): string {
  if (scope.kind === 'none') return ' outside a shot';
  if (scope.kind === 'shot') {
    const name = scope.name?.trim();
    return name ? ` in ${name}` : ' in this shot';
  }
  return '';
}

/**
 * Describes the empty gallery state in one short sentence.
 * With no filters active it reads "No generations yet."; otherwise it names
 * the active filters, most specific first, without a trailing period.
 */
export function describeEmptyState(input: EmptyStateInput): EmptyStateDescription {
  const { mediaType, starredOnly, shotScope } = input;
  const searchTerm = input.searchTerm.trim();
  const hasSearch = searchTerm !== '';
  const hasType = mediaType !== 'all';
  const hasScope = shotScope.kind !== 'all';
  const hasActiveFilters = hasType || starredOnly || hasSearch || hasScope;

  if (!hasActiveFilters) {
    return { message: 'No generations yet.', hasActiveFilters: false };
  }

  const typeNoun = hasType ? TYPE_NOUN[mediaType] : '';
  const noun = [starredOnly ? 'starred' : '', typeNoun].filter(Boolean).join(' ');
  const scope = describeScope(shotScope);

  let base: string;
  if (hasSearch) {
    const quoted = `"${searchTerm}"`;
    if (!noun) base = `Nothing matches ${quoted}`;
    else if (noun === 'starred') base = `Nothing starred matches ${quoted}`;
    else base = `No ${noun} match ${quoted}`;
  } else if (starredOnly && hasType) {
    base = `Nothing starred in ${TYPE_TITLE[mediaType as Exclude<EmptyStateMediaType, 'all'>]}`;
  } else if (starredOnly) {
    base = 'Nothing starred';
  } else if (hasType) {
    base = `No ${typeNoun}`;
  } else {
    base = 'Nothing';
  }

  return { message: `${base}${scope}`, hasActiveFilters: true };
}
