// Canonical 3B Ecosystem record ownership model.
//
// Every durable product record must resolve to one of these ownership contexts:
// 1) user      — personally owned by one 3B ID / profiles.id
// 2) business  — owned by one 3B Business ID / businesses.id
// 3) shared    — operational evidence involving both a person and business
//
// Product-specific tables may retain their native columns, but integrations,
// permissions, exports and cross-product bridges should normalize through this
// contract rather than inventing feature-specific ownership semantics.

export type ThreeBOwnerType = 'user' | 'business' | 'shared'

export interface ThreeBOwnership {
  ownerType: ThreeBOwnerType
  /** Internal profiles.id. three_b_id is the human-readable public identity. */
  userId?: string | null
  /** Internal businesses.id. three_b_biz_id is the human-readable public identity. */
  businessId?: string | null
}

export function validateThreeBOwnership(value: ThreeBOwnership): ThreeBOwnership {
  const userId = value.userId ?? null
  const businessId = value.businessId ?? null

  if (value.ownerType === 'user' && (!userId || businessId)) {
    throw new Error('3B user-owned records require userId and must not set businessId')
  }

  if (value.ownerType === 'business' && (!businessId || userId)) {
    throw new Error('3B business-owned records require businessId and must not set userId')
  }

  if (value.ownerType === 'shared' && (!userId || !businessId)) {
    throw new Error('3B shared records require both userId and businessId')
  }

  return { ownerType: value.ownerType, userId, businessId }
}

export function userOwned(userId: string): ThreeBOwnership {
  return validateThreeBOwnership({ ownerType: 'user', userId })
}

export function businessOwned(businessId: string): ThreeBOwnership {
  return validateThreeBOwnership({ ownerType: 'business', businessId })
}

export function sharedOperational(userId: string, businessId: string): ThreeBOwnership {
  return validateThreeBOwnership({ ownerType: 'shared', userId, businessId })
}

/**
 * Canonical access rule for cross-product integrations.
 * This does not replace product-specific role/permission checks.
 */
export function ownershipMatchesContext(
  ownership: ThreeBOwnership,
  context: { userId?: string | null; businessId?: string | null },
): boolean {
  const o = validateThreeBOwnership(ownership)
  if (o.ownerType === 'user') return !!context.userId && context.userId === o.userId
  if (o.ownerType === 'business') return !!context.businessId && context.businessId === o.businessId
  return (!!context.userId && context.userId === o.userId) ||
         (!!context.businessId && context.businessId === o.businessId)
}
