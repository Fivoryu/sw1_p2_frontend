export interface CurrentUser {
  id: string;
  email: string;
  full_name: string;
  role_id: string;
  role_name: string;
  permissions: string[];
  company_id: string | null;
  department_id: string | null;
  department_name: string | null;
  is_active: boolean;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: CurrentUser;
}
