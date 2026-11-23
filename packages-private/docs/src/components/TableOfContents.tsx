import { useEffect, useRef, useState, type RefObject } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Icon } from '@astryxdesign/core/Icon';
import { useClipboard } from '@astryxdesign/core/hooks';
import { Check, Copy } from 'lucide-react';
import { useDocsPageContext } from '../lib/docsPage';
import { useI18n } from '../lib/i18n';

interface TocHeading {
  id: string;
  text: string;
}

interface TableOfContentsProps {
  contentRef: RefObject<HTMLElement | null>;
  routeKey: string;
}

function slugifyHeading(text: string, index: number): string {
  const base = text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');
  return base ? `${base}-${index}` : `section-${index}`;
}

export function TableOfContents({ contentRef, routeKey }: TableOfContentsProps) {
  const { isZh } = useI18n();
  const { markdown } = useDocsPageContext();
  const { isCopied, copy } = useClipboard();
  const [headings, setHeadings] = useState<TocHeading[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [stickyTop, setStickyTop] = useState<number>(96);
  const tocRef = useRef<HTMLDivElement>(null);
  const manualTargetRef = useRef<{ id: string; until: number } | null>(null);

  useEffect(() => {
    const el = tocRef.current;
    if (!el) return;
    // Lock sticky top to the element's exact resting offset at scrollY = 0 so it never shifts vertically.
    const naturalTop = Math.round(el.getBoundingClientRect().top + window.scrollY);
    if (naturalTop > 0) {
      setStickyTop(naturalTop);
    }
  }, [routeKey]);

  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const collectHeadings = () => {
      const nodes = Array.from(container.querySelectorAll<HTMLHeadingElement>('h1, h2'));
      const next: TocHeading[] = nodes
        .map((node, index) => {
          const text = node.textContent?.trim() ?? '';
          if (!text) return null;
          if (!node.id) {
            node.id = slugifyHeading(text, index);
          }
          node.style.scrollMarginTop = '80px';
          return { id: node.id, text };
        })
        .filter((item): item is TocHeading => item !== null);

      setHeadings(next);
      setActiveId((prev) => (next.some((h) => h.id === prev) ? prev : (next[0]?.id ?? '')));
    };

    collectHeadings();

    const mutationObserver = new MutationObserver(collectHeadings);
    mutationObserver.observe(container, { childList: true, subtree: true, characterData: true });

    return () => {
      mutationObserver.disconnect();
    };
  }, [contentRef, routeKey, isZh]);

  useEffect(() => {
    if (headings.length === 0) return;

    const updateActiveHeading = () => {
      const manual = manualTargetRef.current;
      if (manual && performance.now() < manual.until) {
        return;
      }
      manualTargetRef.current = null;

      // Active heading is strictly the last heading that has crossed the reading line below TopNav.
      const readingLine = 128;
      let current = headings[0]?.id ?? '';
      for (const item of headings) {
        const el = document.getElementById(item.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= readingLine) {
          current = item.id;
        } else {
          break;
        }
      }
      setActiveId(current);
    };

    updateActiveHeading();
    window.addEventListener('scroll', updateActiveHeading, { passive: true });
    window.addEventListener('resize', updateActiveHeading, { passive: true });

    return () => {
      window.removeEventListener('scroll', updateActiveHeading);
      window.removeEventListener('resize', updateActiveHeading);
    };
  }, [headings]);

  const handleJump = (id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    manualTargetRef.current = { id, until: performance.now() + 800 };
    setActiveId(id);
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div
      ref={tocRef}
      style={{
        position: 'sticky',
        top: `${stickyTop}px`,
        alignSelf: 'flex-start',
        flexShrink: 0,
      }}
    >
      <VStack width={200} gap={5}>
        {headings.length > 0 && (
          <VStack
            gap={3}
            style={{
              borderInlineStart: '2px solid var(--color-border)',
            }}
          >
            {headings.map((item) => {
              const isActive = item.id === activeId;
              return (
                <VStack
                  key={item.id}
                  paddingBlock={0}
                  paddingInlineStart={3}
                  style={{
                    marginInlineStart: '-2px',
                    borderInlineStart: isActive
                      ? '2px solid var(--color-text-primary)'
                      : '2px solid transparent',
                    cursor: 'pointer',
                  }}
                  onClick={() => handleJump(item.id)}
                >
                  <Text
                    type="supporting"
                    color={isActive ? 'primary' : 'secondary'}
                    weight={isActive ? 'medium' : 'normal'}
                  >
                    {item.text}
                  </Text>
                </VStack>
              );
            })}
          </VStack>
        )}

        {markdown && (
          <VStack hAlign="start">
            <Button
              label={isZh ? '复制页面' : 'Copy page'}
              variant="secondary"
              size="sm"
              icon={<Icon icon={isCopied ? Check : Copy} />}
              onClick={() => void copy(markdown)}
            />
          </VStack>
        )}
      </VStack>
    </div>
  );
}
