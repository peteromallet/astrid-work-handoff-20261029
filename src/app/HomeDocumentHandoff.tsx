import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { buildHomeDocumentHandoffUrl } from './homeDocumentHandoffUrl.ts';

type ReplaceDocument = (url: string) => void;

interface HomeDocumentHandoffProps {
  replaceDocument?: ReplaceDocument;
}

// Module-scope so the default keeps one identity across renders; an inline default
// would change every render and re-run the handoff effect each time.
const replaceWindowDocument: ReplaceDocument = (url) => window.location.replace(url);

export function HomeDocumentHandoff({
  replaceDocument = replaceWindowDocument,
}: HomeDocumentHandoffProps) {
  const { hash, search } = useLocation();

  useEffect(() => {
    replaceDocument(buildHomeDocumentHandoffUrl({ hash, search }, window.location.origin));
  }, [hash, search, replaceDocument]);

  return null;
}
