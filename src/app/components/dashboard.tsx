import { DashboardIcon, type DashboardIconName } from "@/app/components/dashboard-icon";

type KpiProps = {
  tone: string;
  label: string;
  value: string;
  suffix?: string;
  note?: string;
  icon: DashboardIconName;
};

export function Kpi({ tone, label, value, suffix, note, icon }: KpiProps) {
  return <article className={`kpi-card kpi-${tone}`}><div className="kpi-top"><span className="kpi-icon"><DashboardIcon name={icon} /></span><span className="kpi-arrow" aria-hidden="true">↗</span></div><small>{label}</small><strong>{value}{suffix && <em>{suffix}</em>}</strong>{note && <span className="kpi-note">{note}</span>}</article>;
}

export function PanelHeading({ icon, title, subtitle, tag, level = 2, headingId }: {
  icon: DashboardIconName;
  title: string;
  subtitle: string;
  tag?: string;
  level?: 2 | 3 | 4;
  headingId?: string;
}) {
  const Heading = level === 2 ? "h2" : level === 3 ? "h3" : "h4";
  return <div className="panel-heading"><div><Heading id={headingId}><DashboardIcon name={icon} className="heading-icon" />{title}</Heading><p>{subtitle}</p></div>{tag && <span className="panel-tag">{tag}</span>}</div>;
}

export function Risk({ label, value, tone }: { label: string; value: string; tone: string }) {
  return <div className={`risk-item risk-${tone}`}><small>{label}</small><strong>{value}</strong></div>;
}

export function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return <div className="legend-row"><span className={`legend-dot ${color}`} />{label}<strong>{value}</strong></div>;
}
