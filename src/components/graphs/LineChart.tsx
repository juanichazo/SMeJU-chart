// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ChartData, ChartOptions } from 'chart.js';
import { lazy, Suspense } from 'react';
import type { ComponentType, JSX } from 'react';

function getLineChartOptions(showLegend: boolean): ChartOptions<'line'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        min: 0,
      },
    },
    plugins: {
      legend: {
        display: showLegend,
        position: 'bottom' as const,
        labels: {
          boxWidth: 10,
          boxHeight: 10,
          padding: 8,
          font: { size: 10 },
        },
      },
    },
  };
}

interface LineChartProps {
  readonly chartData: ChartData<'line', number[], string>;
  /** Whether to show the dataset legend below the chart. Defaults to true. */
  readonly showLegend?: boolean;
  /** Pixel height of the chart's container. Defaults to 160 — bump this up when a legend needs room. */
  readonly height?: number;
}

const AsyncLine = lazy(async () => {
  const { CategoryScale, Chart, Legend, LinearScale, LineElement, PointElement, Title, Tooltip } = await import(
    'chart.js'
  );
  Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);
  const { Line } = await import('react-chartjs-2');
  return {
    default: Line as ComponentType<{ data: ChartData<'line', number[], string>; options: ChartOptions<'line'> }>,
  };
});

export function LineChart({ chartData, showLegend = true, height = 160 }: LineChartProps): JSX.Element {
  return (
    <div style={{ margin: '1.25rem 0', height }}>
      <Suspense fallback={<div>Loading...</div>}>
        <AsyncLine options={getLineChartOptions(showLegend)} data={chartData} />
      </Suspense>
    </div>
  );
}
