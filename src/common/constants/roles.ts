export const Role = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  AGENT: 'AGENT',
} as const;

export type Role = (typeof Role)[keyof typeof Role];
