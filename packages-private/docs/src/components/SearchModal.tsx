import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { CommandPalette, CommandPaletteInput } from '@astryxdesign/core/CommandPalette';
import { createStaticSource } from '@astryxdesign/core/Typeahead';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Kbd } from '@astryxdesign/core/Kbd';
import { SEARCH_ITEMS } from '../data/components';
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
    isNew?: boolean;
    path: string;
  };
}

export function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const { isZh } = useI18n();
  const navigate = useNavigate();

  const items = useMemo<SearchPaletteItem[]>(
    () =>
      SEARCH_ITEMS.map((entry) => ({
        id: `${entry.category}::${entry.name}`,
        label: entry.name,
        auxiliaryData: {
          group: entry.category,
          isNew: entry.isNew,
          path: entry.path,
        },
      })),
    [],
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
      label={isZh ? '搜索 Cesiumlab 文档' : 'Search Cesiumlab components'}
      width={512}
      searchSource={source}
      input={
        <CommandPaletteInput
          placeholder={isZh ? '搜索文档、模块、API...' : 'Search docs, modules, API...'}
          endContent={<Kbd keys="esc" />}
        />
      }
      emptySearchText={isZh ? '未找到匹配内容。' : 'No matching components found.'}
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
            <HStack gap={2} vAlign="center">
              <Text type="body">{item.label}</Text>
              {meta?.isNew && <StatusDot variant="accent" label="New component" />}
            </HStack>
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
