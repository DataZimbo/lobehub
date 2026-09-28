'use client';

import { cssVar } from 'antd-style';
import { memo } from 'react';

const HEIGHT = 28;

/** Shape-only trend line under a stat: no axes, the number above carries the value. */
const TrendSparkline = memo<{ values: number[] }>(({ values }) => {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1e-9, max - min);
  const width = 100;
  const sx = (index: number) => (index / (values.length - 1)) * width;
  const sy = (value: number) => HEIGHT - 2 - ((value - min) / span) * (HEIGHT - 4);
  const d = values
    .map((value, index) => `${index === 0 ? 'M' : 'L'} ${sx(index)} ${sy(value)}`)
    .join(' ');

  return (
    <svg
      aria-hidden
      data-widget-sparkline
      height={HEIGHT}
      preserveAspectRatio={'none'}
      viewBox={`0 0 ${width} ${HEIGHT}`}
      width={'100%'}
    >
      <path
        d={d}
        fill={'none'}
        stroke={cssVar.colorPrimary}
        strokeWidth={1.5}
        vectorEffect={'non-scaling-stroke'}
      />
    </svg>
  );
});

TrendSparkline.displayName = 'DashboardTrendSparkline';

export default TrendSparkline;
