export type DashboardTone = 'default' | 'success' | 'warning' | 'danger' | 'info';
export type DashboardPanelType = 'general' | 'area' | 'worker' | 'audit' | 'tracking';
export type DashboardChartType = 'bar' | 'donut';

export interface DashboardMetric {
  key: string;
  label: string;
  value: string;
  hint?: string | null;
  tone?: DashboardTone;
}

export interface DashboardListItem {
  title: string;
  subtitle?: string | null;
  value?: string | null;
  tone?: DashboardTone;
  meta?: string | null;
  badge?: string | null;
}

export interface DashboardChartPoint {
  label: string;
  value: number;
  tone?: DashboardTone;
}

export interface DashboardChart {
  key: string;
  title: string;
  description?: string | null;
  chart_type: DashboardChartType;
  points: DashboardChartPoint[];
}

export interface DashboardSection {
  key: string;
  title: string;
  description?: string | null;
  items: DashboardListItem[];
}

export interface DashboardPanel {
  panel_type: DashboardPanelType;
  title: string;
  subtitle: string;
  metrics: DashboardMetric[];
  sections: DashboardSection[];
  charts?: DashboardChart[];
}
