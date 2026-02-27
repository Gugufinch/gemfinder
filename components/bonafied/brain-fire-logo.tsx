export function BrainFireLogo({ size = 24 }: { size?: number }) {
  return (
    <img
      src="/bonafied-logo.png"
      alt="Bonafied logo"
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: 'contain', borderRadius: Math.max(6, Math.round(size * 0.22)) }}
    />
  );
}
