export interface UserContext {
  userId?: string;
  instituteId?: string;
  role?: string;
}

export function extractUserContext(userOrUserId?: any): UserContext {
  if (!userOrUserId) return {};
  if (typeof userOrUserId === 'string') {
    return { userId: userOrUserId };
  }
  return {
    userId: userOrUserId.userId || userOrUserId.id,
    instituteId: userOrUserId.instituteId || undefined,
    role: userOrUserId.role || userOrUserId.roleName || undefined,
  };
}

export function scopeWhere(where: any = {}, instituteId?: string): any {
  if (instituteId) {
    const scopeCondition = {
      OR: [
        { instituteId },
        { instituteId: null },
      ],
    };

    if (Object.keys(where).length === 0) {
      return scopeCondition;
    }

    return {
      AND: [
        where,
        scopeCondition,
      ],
    };
  }
  return where;
}

