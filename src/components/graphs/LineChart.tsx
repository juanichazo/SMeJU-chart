// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ChartData, ChartOptions } from 'chart.js';
import { lazy, Suspense } from 'react';
import type { ComponentType, JSX } from 'react';

function getLineChartOptions(showLegend: boolean): ChartOptions<'line'> {
  return {
    responsive: true,
    scales: {
      y: {
        min: 0,
      },
    },
    plugins: {
      legend: {
        display: showLegend,
        position: 'bottom' as const,
      },
    },
  };
}

interface LineChartProps {
  readonly chartData: ChartData<'line', number[], string>;
  /** Whether to show the dataset legend below the chart. Defaults to true. */
  readonly showLegend?: boolean;
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

export function LineChart({ chartData, showLegend = true }: LineChartProps): JSX.Element {
  return (
    <div style={{ margin: '1.25rem 0' }}>
      <Suspense fallback={<div>Loading...</div>}>
        <AsyncLine options={getLineChartOptions(showLegend)} data={chartData} />
      </Suspense>
    </div>
  );
}
