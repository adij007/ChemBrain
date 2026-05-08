export type AppRole = 'admin' | 'scientist' | 'analyst' | 'educator' | 'student' | 'viewer';

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: 'Admin',
  scientist: 'Scientist',
  analyst: 'Analyst',
  educator: 'Educator',
  student: 'Student',
  viewer: 'Viewer',
};

export type Action =
  | 'research.read' | 'research.save'
  | 'simulation.read' | 'simulation.run'
  | 'program.read' | 'program.write' | 'program.delete'
  | 'learning.read' | 'admin.users';

const PERMISSIONS: Record<AppRole, Action[]> = {
  admin: ['research.read','research.save','simulation.read','simulation.run','program.read','program.write','program.delete','learning.read','admin.users'],
  scientist: ['research.read','research.save','simulation.read','simulation.run','program.read','program.write','learning.read'],
  analyst: ['research.read','simulation.read','simulation.run','program.read','program.write','learning.read'],
  educator: ['research.read','learning.read','program.read','simulation.read','simulation.run'],
  student: ['research.read','learning.read','simulation.read','simulation.run'],
  viewer: ['research.read','simulation.read','simulation.run','program.read','learning.read'],
};

export function can(roles: AppRole[], action: Action): boolean {
  return roles.some((r) => PERMISSIONS[r]?.includes(action));
}

export function highestRole(roles: AppRole[]): AppRole {
  const order: AppRole[] = ['admin','scientist','analyst','educator','student','viewer'];
  for (const r of order) if (roles.includes(r)) return r;
  return 'viewer';
}
