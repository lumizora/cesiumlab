import { Badge } from '@astryxdesign/core/Badge';

type Tone = 'ok' | 'warn' | 'muted' | 'danger' | 'info';
const VARIANTS: Record<Tone, 'green' | 'orange' | 'neutral' | 'error' | 'blue'> = {
  ok: 'green',
  warn: 'orange',
  muted: 'neutral',
  danger: 'error',
  info: 'blue',
};

export default function StatusBadge({ label, tone }: { label: string; tone: Tone }) {
  // The wrapper also preserves the old .badge E2E locator while the actual visual
  // component is Astryx's accessible React Badge, not a hand-built imitation.
  return (
    <span className="badge">
      <Badge label={label} variant={VARIANTS[tone]} />
    </span>
  );
}
