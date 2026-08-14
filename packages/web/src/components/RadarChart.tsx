/* eslint-disable complexity */

/**
 * Pure-SVG radar chart built with D3 math utilities.
 * Compatible with `renderToStaticMarkup` (no DOM APIs used).
 */

export interface RadarChartAxis {
  readonly label: string;
  readonly value: number; // 0–100
}

export interface RadarChartProps {
  readonly axes: readonly RadarChartAxis[];
  /** SVG size in px (square). Default 260. */
  readonly size?: number;
  /** Max value on each axis. Default 100. */
  readonly maxValue?: number;
  /** Concentric grid rings count. Default 4. */
  readonly levels?: number;
  /** Pass threshold line value (0–100). Default 75. */
  readonly threshold?: number;
}

const PASS_COLOR = '#1976d2'; // MUI primary.main
const FAIL_COLOR = '#d32f2f'; // MUI error.main
const FILL_PASS = 'rgba(25, 118, 210, 0.15)';
const FILL_FAIL = 'rgba(211, 47, 47, 0.15)';
const GRID_COLOR = '#e0e0e0';
const AXIS_COLOR = '#9e9e9e';
const LABEL_COLOR = '#424242';

function polarToCartesian(cx: number, cy: number, r: number, angleRad: number): [number, number] {
  return [cx + r * Math.cos(angleRad), cy + r * Math.sin(angleRad)];
}

function buildPolygonPoints(
  cx: number,
  cy: number,
  radius: number,
  values: readonly number[],
  maxValue: number,
  count: number,
): string {
  return values
    .map((v, i) => {
      const angle = (Math.PI / 2) + (2 * Math.PI * i) / count;
      const r = (v / maxValue) * radius;
      const [x, y] = polarToCartesian(cx, cy, r, -angle);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

export function RadarChart({
  axes,
  size = 260,
  maxValue = 100,
  levels = 4,
  threshold = 75,
}: RadarChartProps) {
  const count = axes.length;
  if (count < 3) return null;

  const cx = size / 2;
  const cy = size / 2;
  const labelPad = 30;
  const radius = cx - labelPad;

  const avgValue = axes.reduce((sum, a) => sum + a.value, 0) / count;
  const passing = avgValue >= threshold;
  const strokeColor = passing ? PASS_COLOR : FAIL_COLOR;
  const fillColor = passing ? FILL_PASS : FILL_FAIL;

  // Grid rings
  const rings = Array.from({ length: levels }, (_, i) => {
    const r = (radius * (i + 1)) / levels;
    const points = Array.from({ length: count }, (__, j) => {
      const angle = (Math.PI / 2) + (2 * Math.PI * j) / count;
      const [x, y] = polarToCartesian(cx, cy, r, -angle);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');
    return { key: i, points, r };
  });

  // Threshold ring
  const thresholdR = (threshold / maxValue) * radius;
  const thresholdPoints = Array.from({ length: count }, (_, j) => {
    const angle = (Math.PI / 2) + (2 * Math.PI * j) / count;
    const [x, y] = polarToCartesian(cx, cy, thresholdR, -angle);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');

  // Axis lines & labels
  const axisLines = axes.map((axis, i) => {
    const angle = (Math.PI / 2) + (2 * Math.PI * i) / count;
    const [x2, y2] = polarToCartesian(cx, cy, radius, -angle);
    const [lx, ly] = polarToCartesian(cx, cy, radius + labelPad - 4, -angle);
    return { key: i, x2, y2, lx, ly, label: axis.label };
  });

  // Data polygon
  const dataPoints = buildPolygonPoints(cx, cy, radius, axes.map((a) => a.value), maxValue, count);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-label="维度评分雷达图"
      role="img"
    >
      {/* Grid rings */}
      {rings.map(({ key, points }) => (
        <polygon
          key={key}
          points={points}
          fill="none"
          stroke={GRID_COLOR}
          strokeWidth="1"
        />
      ))}

      {/* Threshold ring */}
      <polygon
        points={thresholdPoints}
        fill="none"
        stroke="#fb8c00"
        strokeWidth="1"
        strokeDasharray="4 3"
        opacity="0.8"
      />

      {/* Axis lines */}
      {axisLines.map(({ key, x2, y2 }) => (
        <line
          key={key}
          x1={cx.toFixed(2)}
          y1={cy.toFixed(2)}
          x2={x2.toFixed(2)}
          y2={y2.toFixed(2)}
          stroke={AXIS_COLOR}
          strokeWidth="1"
        />
      ))}

      {/* Data area */}
      <polygon
        points={dataPoints}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Data dots */}
      {axes.map((axis, i) => {
        const angle = (Math.PI / 2) + (2 * Math.PI * i) / count;
        const r = (axis.value / maxValue) * radius;
        const [x, y] = polarToCartesian(cx, cy, r, -angle);
        return (
          <circle
            key={i}
            cx={x.toFixed(2)}
            cy={y.toFixed(2)}
            r="3"
            fill={strokeColor}
          />
        );
      })}

      {/* Axis labels */}
      {axisLines.map(({ key, lx, ly, label }) => {
        const dx = lx - cx;
        const textAnchor = dx > 2 ? 'start' : dx < -2 ? 'end' : 'middle';
        return (
          <text
            key={key}
            x={lx.toFixed(2)}
            y={ly.toFixed(2)}
            textAnchor={textAnchor}
            dominantBaseline="middle"
            fontSize="9"
            fill={LABEL_COLOR}
          >
            {label}
          </text>
        );
      })}

      {/* Level labels (right side) */}
      {rings.map(({ key, r }) => {
        const val = Math.round((maxValue * (key + 1)) / levels);
        const [x, y] = polarToCartesian(cx, cy, r, 0); // 3 o'clock
        return (
          <text
            key={key}
            x={(x + 3).toFixed(2)}
            y={y.toFixed(2)}
            fontSize="8"
            fill={AXIS_COLOR}
            dominantBaseline="middle"
          >
            {val}
          </text>
        );
      })}
    </svg>
  );
}
