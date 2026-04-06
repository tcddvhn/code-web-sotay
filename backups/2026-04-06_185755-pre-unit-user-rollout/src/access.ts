import { AssignmentUser, UserProfile } from './types';

export function getAssignmentKey(email?: string | null) {
  return email?.trim().toLowerCase() || '';
}

export function buildAssignmentUsers(userProfiles: UserProfile[]): AssignmentUser[] {
  return userProfiles
    .filter((profile) => !!profile.email && profile.role !== 'unit_user')
    .map((profile) => ({
      id: getAssignmentKey(profile.email),
      email: profile.email || '',
      displayName: profile.displayName || profile.email || 'Chưa rõ',
      role: profile.role,
      userId: profile.id,
    }))
    .sort((left, right) => {
      if (left.role !== right.role) {
        if (left.role === 'admin') {
          return -1;
        }
        if (right.role === 'admin') {
          return 1;
        }
        return left.role.localeCompare(right.role);
      }
      return (left.displayName || left.email).localeCompare(right.displayName || right.email, 'vi');
    });
}
