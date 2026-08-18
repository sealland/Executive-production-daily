"use client";

import { AlertTriangle, Inbox, Loader2 } from "lucide-react";

export function Panel({
  title,
  subtitle,
  children,
  action
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

export function LoadingState({ label = "กำลังโหลดข้อมูล..." }: { label?: string }) {
  return (
    <div className="state-box">
      <Loader2 className="spin" size={18} />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ label = "ไม่พบข้อมูลในช่วงที่เลือก" }: { label?: string }) {
  return (
    <div className="state-box muted">
      <Inbox size={18} />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="state-box error">
      <AlertTriangle size={18} />
      <span>{message}</span>
    </div>
  );
}
