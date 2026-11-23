import { Navigate, useParams } from 'react-router';
import { getEffectDemo } from '../lib/effectDemos';

export function EffectDemoRoute() {
  const { demoId } = useParams<{ demoId: string }>();
  const entry = demoId ? getEffectDemo(demoId) : undefined;

  if (!entry) {
    return <Navigate to="/docs/introduction" replace />;
  }

  const DemoComponent = entry.Component;
  return <DemoComponent />;
}
