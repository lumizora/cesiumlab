import { useMemo } from 'react';
import { CommandPalette, CommandPaletteInput } from '@astryxdesign/core/CommandPalette';
import { createStaticSource } from '@astryxdesign/core/Typeahead';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Kbd } from '@astryxdesign/core/Kbd';
import { SEARCH_ITEMS } from '../data/components';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDoc: (docName: string) => void;
}

interface SearchPaletteItem {
  id: string;
  label: string;
  auxiliaryData: {
    group: string;
    isNew?: boolean;
    targetDoc: string;
  };
}

export function SearchModal({ isOpen, onClose, onSelectDoc }: SearchModalProps) {
  const items = useMemo<SearchPaletteItem[]>(
    () =>
      SEARCH_ITEMS.map((entry) => ({
        id: `${entry.category}::${entry.name}`,
        label: entry.name,
        auxiliaryData: {
          group: entry.category,
          isNew: entry.isNew,
          targetDoc: entry.targetDoc || 'Volumetric Clouds',
        },
      })),
    [],
  );

  const source = useMemo(() => createStaticSource(items), [items]);

  return (
    <CommandPalette
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      label="Search Cesiumlab components"
      width={512}
      searchSource={source}
      input={
        <CommandPaletteInput
          placeholder="Search components, effects, shaders..."
          endContent={<Kbd keys="esc" />}
        />
      }
      emptySearchText="No matching components found."
      onValueChange={(selectedId) => {
        const match = items.find((item) => item.id === selectedId);
        if (match) {
          onSelectDoc(match.auxiliaryData.targetDoc);
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
