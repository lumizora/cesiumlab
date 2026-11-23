import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface DocsPageContextValue {
  markdown: string;
  setMarkdown: (markdown: string) => void;
}

const DocsPageContext = createContext<DocsPageContextValue>({
  markdown: '',
  setMarkdown: () => {},
});

export function DocsPageProvider({ children }: { children: ReactNode }) {
  const [markdown, setMarkdown] = useState('');

  return (
    <DocsPageContext.Provider value={{ markdown, setMarkdown }}>
      {children}
    </DocsPageContext.Provider>
  );
}

export function useDocsPageContext(): DocsPageContextValue {
  return useContext(DocsPageContext);
}

/** Registers the active page's Markdown content for the right-rail Copy Page button. */
export function useDocsPageMarkdown(markdown: string): void {
  const { setMarkdown } = useDocsPageContext();

  useEffect(() => {
    setMarkdown(markdown);
    return () => setMarkdown('');
  }, [markdown, setMarkdown]);
}
