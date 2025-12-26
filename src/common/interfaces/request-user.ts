import { Role } from '../constants/roles';

export interface RequestUser {
  id: string;
  tenantId: string;
  email: string;
  role: Role;
}
