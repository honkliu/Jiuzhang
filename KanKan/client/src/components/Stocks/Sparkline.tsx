import React from 'react';
import { Box } from '@mui/material';
import { styled } from '@mui/material/styles';

const BoxAny = Box as any;

/** SVG with block layout — avoids the inline-baseline gap below the element. */
const SparkSvg = styled('svg')({ display: 'block', verticalAlign: 'middle' });

interface SparklineProps {
  /** Series of close prices (oldest -> newest). */
  values: number[];
  width?: number;
  height?: number;
  /** Number of trailing points to plot (clips to values.length). */
  trailing?: number;
  /** Stroke color override. By default derives from first vs last value. */
  color?: string;
  strokeWidth?: number;
}

/**
 * Lightweight SVG sparkline. No deps, no area fill, no transparency —
 * a single crisp line that's easy to scan in a dense table row.
 */
export const Sparkline: React.FC<SparklineProps> = ({
  values,
  width = 110,
  height = 26,
  trailing = 120,
  color,
  strokeWidth = 1.25,
}) => {
  if (!values || values.length < 2) {
    return <BoxAny sx={{ width, height, display: 'inline-block' }} />;
  }
  const start = Math.max(0, values.length - trailing);
  const series = values.slice(start);
  const n = series.length;

  let min = Infinity;
  let max = -Infinity;
  for (const v of series) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;

  const padX = 1;
  const padY = 2;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const x = (i: number) => padX + (i * innerW) / (n - 1);
  const y = (v: number) => padY + innerH - ((v - min) / range) * innerH;

  let d = '';
  for (let i = 0; i < n; i++) {
    d += (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ',' + y(series[i]).toFixed(1);
  }

  const trendUp = series[n - 1] >= series[0];
  const stroke = color ?? (trendUp ? '#0a7d27' : '#c62828');

  return (
    <SparkSvg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="sparkline"
    >
      <path
        d={d}
        stroke={stroke}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </SparkSvg>
  );
};
