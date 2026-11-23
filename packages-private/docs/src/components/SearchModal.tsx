import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { CommandPalette, CommandPaletteInput } from '@astryxdesign/core/CommandPalette';
import { createStaticSource } from '@astryxdesign/core/Typeahead';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Kbd } from '@astryxdesign/core/Kbd';
import { MODULE_CATALOG } from '../data/catalog';
import { useI18n } from '../lib/i18n';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SearchPaletteItem {
  id: string;
  label: string;
  auxiliaryData: {
    group: string;
    path: string;
  };
}

export function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const { isZh } = useI18n();
  const navigate = useNavigate();

  const items = useMemo<SearchPaletteItem[]>(
    () => [
      {
        id: 'getting-started::introduction',
        label: isZh ? '介绍 (Introduction)' : 'Introduction',
        auxiliaryData: {
          group: isZh ? '快速开始' : 'Getting Started',
          path: '/docs/introduction',
        },
      },
      {
        id: 'getting-started::installation',
        label: isZh ? '安装 (Installation)' : 'Installation',
        auxiliaryData: {
          group: isZh ? '快速开始' : 'Getting Started',
          path: '/docs/installation',
        },
      },
      ...MODULE_CATALOG.map((entry) => ({
        id: `module::${entry.id}`,
        label: isZh ? `${entry.titleZh} (${entry.titleEn})` : entry.titleEn,
        auxiliaryData: {
          group: isZh ? '视觉特效' : entry.section,
          path: entry.path,
        },
      })),
    ],
    [isZh],
  );

  const source = useMemo(() => createStaticSource(items), [items]);

  return (
    <CommandPalette
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          window.requestAnimationFrame(() => {
            if (document.activeElement instanceof HTMLElement) {
              document.activeElement.blur();
            }
          });
        }
      }}
      label={isZh ? '搜索 Cesiumlab 文档' : 'Search Cesiumlab docs'}
      width={512}
      searchSource={source}
      input={
        <CommandPaletteInput
          placeholder={isZh ? '搜索文档、模块、API...' : 'Search docs, modules, API...'}
          endContent={<Kbd keys="esc" />}
        />
      }
      emptySearchText={isZh ? '未找到匹配内容。' : 'No matching items found.'}
      onValueChange={(selectedId) => {
        const match = items.find((item) => item.id === selectedId);
        if (match) {
          void navigate(match.auxiliaryData.path);
          onClose();
        }
      }}
      renderItem={(item) => {
        const meta = item.auxiliaryData as SearchPaletteItem['auxiliaryData'] | undefined;
        return (
          <HStack gap={2} vAlign="center" hAlign="between" width="100%">
            <Text type="body">{item.label}</Text>
            {meta?.group && (
              <Text type="supporting" size="xsm">
                {meta.group}
              </Text>
            )}
          </HStack>
        );
      }}
    />
  );
}
