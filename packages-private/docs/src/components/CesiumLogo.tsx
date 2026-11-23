import logoUrl from '../assets/logo.png';

export function CesiumLogo({ size = 28 }: { size?: number }) {
  return (
    <img
      src={logoUrl}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      style={{
        display: 'block',
        objectFit: 'contain',
        borderRadius: 'var(--radius-sm)',
      }}
    />
  );
}
