import { useThemeStore } from '../../store/themeStore';

interface LogoProps {
  /** 'full' shows mark + wordmark (default), 'mark' shows the icon only */
  variant?: 'full' | 'mark';
  className?: string;
  height?: number;
}

/**
 * Botmem logo — auto-switches between dark and light variants based on theme.
 * Uses SVGs from /public so no import needed (served as static assets).
 */
export function Logo({ variant = 'full', className, height }: LogoProps) {
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);

  if (variant === 'mark') {
    return (
      <img
        src="/logo-mark.svg"
        alt="Botmem"
        height={height ?? 32}
        width={height ?? 32}
        className={className}
      />
    );
  }

  const src = resolvedTheme === 'light' ? '/logo-light.svg' : '/logo.svg';

  return (
    <img
      src={src}
      alt="Botmem"
      height={height ?? 36}
      className={className}
      style={{ width: 'auto' }}
    />
  );
}
