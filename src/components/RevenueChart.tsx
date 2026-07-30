import { formatMoney } from "../../shared/format";

const MONTH_INITIALS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/**
 * Twelve-month invoiced-value chart. Hand-rolled SVG — a charting library
 * would be several times the size of everything else on the page.
 */
export function RevenueChart({ data }: { data: { month: string; totalPence: number }[] }) {
  const width = 720;
  const height = 200;
  const padding = { top: 12, right: 8, bottom: 26, left: 56 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const max = Math.max(1, ...data.map((point) => point.totalPence));
  const niceMax = roundUpNice(max);
  const slotWidth = data.length > 0 ? plotWidth / data.length : plotWidth;
  const barWidth = Math.max(6, slotWidth * 0.58);

  const ticks = [0, niceMax / 2, niceMax];

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Invoiced value over the last twelve months"
    >
      {ticks.map((tick) => {
        const y = padding.top + plotHeight - (tick / niceMax) * plotHeight;
        return (
          <g key={tick}>
            <line
              className="grid-line"
              x1={padding.left}
              x2={width - padding.right}
              y1={y}
              y2={y}
            />
            <text className="axis-label" x={padding.left - 8} y={y + 3} textAnchor="end">
              {shortMoney(tick)}
            </text>
          </g>
        );
      })}

      {data.map((point, index) => {
        const barHeight = (point.totalPence / niceMax) * plotHeight;
        const x = padding.left + index * slotWidth + (slotWidth - barWidth) / 2;
        const y = padding.top + plotHeight - barHeight;
        const monthIndex = Number(point.month.slice(5, 7)) - 1;

        return (
          <g key={point.month}>
            <rect
              className="bar"
              x={x}
              y={point.totalPence > 0 ? y : padding.top + plotHeight - 1}
              width={barWidth}
              height={point.totalPence > 0 ? Math.max(2, barHeight) : 1}
              rx={3}
            >
              <title>{`${point.month}: ${formatMoney(point.totalPence)}`}</title>
            </rect>
            <text
              className="axis-label"
              x={x + barWidth / 2}
              y={height - 8}
              textAnchor="middle"
            >
              {MONTH_INITIALS[monthIndex] ?? ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** £1,234.56 -> "£1.2k" so the axis stays legible at small widths. */
function shortMoney(pence: number): string {
  const pounds = pence / 100;
  if (pounds >= 1000) return `£${(pounds / 1000).toFixed(pounds >= 10000 ? 0 : 1)}k`;
  return `£${Math.round(pounds)}`;
}

function roundUpNice(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}
