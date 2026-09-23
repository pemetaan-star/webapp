type KpiProps = {
  tone: string;
  label: string;
  value: string;
  suffix?: string;
  note: string;
  icon: string;
};

export function Kpi({ tone, label, value, suffix, note, icon }: KpiProps) {
  return <article className={`kpi-card kpi-${tone}`}><div className="kpi-top"><span className="kpi-icon">{icon}</span><span className="kpi-arrow">↗</span></div><small>{label}</small><strong>{value}{suffix && <em>{suffix}</em>}</strong><span className="kpi-note">{note}</span></article>;
}

export function PanelHeading({ icon, title, subtitle, tag }: { icon: string; title: string; subtitle: string; tag?: string }) {
  return <div className="panel-heading"><div><h2><span className="heading-icon">{icon}</span>{title}</h2><p>{subtitle}</p></div>{tag && <span className="panel-tag">{tag}</span>}</div>;
}

export function Risk({ label, value, tone }: { label: string; value: string; tone: string }) {
  return <div className={`risk-item risk-${tone}`}><small>{label}</small><strong>{value}</strong></div>;
}

export function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return <div className="legend-row"><span className={`legend-dot ${color}`} />{label}<strong>{value}</strong></div>;
}
