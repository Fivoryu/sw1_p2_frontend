export interface AuditLogItemApi {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  resource: string;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

export interface AuditLogListApi {
  items: AuditLogItemApi[];
  total: number;
}
