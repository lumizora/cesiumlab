import { Fragment, useEffect, useState } from 'react';
import { Divider } from '@astryxdesign/core/Divider';
import { HStack } from '@astryxdesign/core/HStack';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Slider } from '@astryxdesign/core/Slider';
import { Switch } from '@astryxdesign/core/Switch';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';

export interface ParamColorOption {
  type: 'color';
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export interface ParamSliderOption {
  type: 'slider';
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

export interface ParamSwitchOption {
  type: 'switch';
  id: string;
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

export interface ParamSegmentOption {
  type: 'segment';
  id: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}

export type ParamControl =
  | ParamColorOption
  | ParamSliderOption
  | ParamSwitchOption
  | ParamSegmentOption;

export interface ParamGroup {
  id: string;
  label: string;
  controls: readonly ParamControl[];
}

export interface EffectParamPanelProps {
  groups: readonly ParamGroup[];
  /** Desktop renders all groups in a scrollable side column; mobile uses group tabs below the canvas. */
  layout: 'side' | 'tabs';
}

function ColorControlField({ control }: { control: ParamColorOption }) {
  return (
    <HStack hAlign="between" vAlign="center" width="100%">
      <Text type="supporting" size="xsm">
        {control.label}
      </Text>
      <label
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--spacing-2)',
          paddingBlock: 'var(--spacing-1)',
          paddingInline: 'var(--spacing-2)',
          borderRadius: 'var(--radius-element)',
          border: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-background-muted)',
          cursor: 'pointer',
          overflow: 'hidden',
        }}
      >
        <input
          type="color"
          aria-label={control.label}
          value={control.value}
          onChange={(event) => control.onChange(event.target.value)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: 'pointer',
          }}
        />
        <span
          aria-hidden="true"
          style={{
            width: '0.875rem',
            height: '0.875rem',
            borderRadius: 'var(--radius-inner)',
            backgroundColor: control.value,
            border: '1px solid var(--color-border-emphasized)',
            flexShrink: 0,
          }}
        />
        <Text type="supporting" size="xsm" weight="medium">
          {control.value.toUpperCase()}
        </Text>
      </label>
    </HStack>
  );
}

function ParamControlItem({ control }: { control: ParamControl }) {
  switch (control.type) {
    case 'color':
      return <ColorControlField control={control} />;
    case 'slider':
      return (
        <Slider
          label={control.label}
          value={control.value}
          min={control.min}
          max={control.max}
          step={control.step}
          onChange={control.onChange}
        />
      );
    case 'switch':
      return (
        <Switch
          label={control.label}
          value={control.value}
          onChange={control.onChange}
          size="sm"
          labelPosition="start"
          labelSpacing="spread"
          width="100%"
        />
      );
    case 'segment':
      return (
        <VStack gap={1.5} width="100%">
          <Text type="supporting" size="xsm">
            {control.label}
          </Text>
          <SegmentedControl
            label={control.label}
            size="sm"
            layout="fill"
            value={control.value}
            onChange={control.onChange}
          >
            {control.options.map((option) => (
              <SegmentedControlItem key={option.value} value={option.value} label={option.label} />
            ))}
          </SegmentedControl>
        </VStack>
      );
  }
}

export function EffectParamPanel({ groups, layout }: EffectParamPanelProps) {
  const [activeGroupId, setActiveGroupId] = useState(() => groups[0]?.id ?? '');

  useEffect(() => {
    if (!groups.some((group) => group.id === activeGroupId)) {
      setActiveGroupId(groups[0]?.id ?? '');
    }
  }, [groups, activeGroupId]);

  if (groups.length === 0) return null;

  if (layout === 'tabs') {
    const activeGroup = groups.find((group) => group.id === activeGroupId) ?? groups[0]!;
    return (
      <VStack gap={3} width="100%">
        {groups.length > 1 && (
          <SegmentedControl
            label="Parameter groups"
            size="sm"
            layout="fill"
            value={activeGroup.id}
            onChange={setActiveGroupId}
          >
            {groups.map((group) => (
              <SegmentedControlItem key={group.id} value={group.id} label={group.label} />
            ))}
          </SegmentedControl>
        )}
        <VStack gap={3} width="100%">
          {activeGroup.controls.map((control) => (
            <ParamControlItem key={control.id} control={control} />
          ))}
        </VStack>
      </VStack>
    );
  }

  return (
    <VStack gap={4} width="100%">
      {groups.map((group, index) => (
        <Fragment key={group.id}>
          {index > 0 && <Divider />}
          <VStack gap={3} width="100%">
            <Text type="supporting" size="xsm" weight="semibold">
              {group.label}
            </Text>
            {group.controls.map((control) => (
              <ParamControlItem key={control.id} control={control} />
            ))}
          </VStack>
        </Fragment>
      ))}
    </VStack>
  );
}
