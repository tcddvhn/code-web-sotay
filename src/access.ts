import { AssignmentUser, UserProfile } from './types';

export interface AllowedAccount {
  email: string;
  displayName: string;
  role: 'admin' | 'contributor';
}

export const ALLOWED_ACCOUNTS: AllowedAccount[] = [
  { email: 'admin@sotay.com', displayName: 'Lê Đình Kiên', role: 'admin' },
  { email: 'trieuthingoc@sotay.com', displayName: 'Triệu Thị Ngọc', role: 'contributor' },
  { email: 'tranthikieuanh@sotay.com', displayName: 'Trần Thị Kiều Anh', role: 'contributor' },
  { email: 'tranphuongha@sotay.com', displayName: 'Trần Phương Hà', role: 'contributor' },
  { email: 'phamthithuhanh@sotay.com', displayName: 'Phạm Thị Thu Hạnh', role: 'contributor' },
  { email: 'nguyenthugiang@sotay.com', displayName: 'Nguyễn Thu Giang', role: 'contributor' },
  { email: 'nguyensinghiem@sotay.com', displayName: 'Nguyễn Sĩ Nghiêm', role: 'contributor' },
  { email: 'nguyenhuuhung@sotay.com', displayName: 'Nguyễn Hữu Hùng', role: 'contributor' },
];

const ALLOWED_ACCOUNT_MAP = new Map(ALLOWED_ACCOUNTS.map((account) => [account.email, account]));
const ADMIN_EMAILS = new Set(
  ALLOWED_ACCOUNTS.filter((account) => account.role === 'admin').map((account) => account.email),
);

export function getAssignmentKey(email?: string | null) {
  return email?.trim().toLowerCase() || '';
}

export function getAllowedAccount(email?: string | null) {
  return ALLOWED_ACCOUNT_MAP.get(getAssignmentKey(email));
}

export function isAllowedEmail(email?: string | null) {
  return !!getAllowedAccount(email);
}

export function isAdminEmail(email?: string | null) {
  return ADMIN_EMAILS.has(getAssignmentKey(email));
}

export function buildAssignmentUsers(userProfiles: UserProfile[]): AssignmentUser[] {
  const userMap = new Map(
    userProfiles
      .filter((profile) => profile.email)
      .map((profile) => [getAssignmentKey(profile.email), profile]),
  );

  return ALLOWED_ACCOUNTS.map((account) => {
    const existing = userMap.get(account.email);
    return {
      id: account.email,
      email: account.email,
      displayName: account.displayName,
      role: existing?.role || account.role,
      userId: existing?.id,
    };
  });
}
