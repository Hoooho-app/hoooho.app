/** Temporary product visibility. Keep implementations and saved data for a later release. */
export const PRODUCT_FEATURES = Object.freeze({ auxiliaryTools: false, careJourney: false, membership: false })

const featurePaths = {
  auxiliaryTools: ['/dietary-card', '/food-observations', '/food-label', '/medication-reminders', '/care-handoff', '/desensitization-tests', '/nurse-station/desensitization'],
  careJourney: ['/care-journey', '/care-tools', '/family-sharing', '/health-profile/vaccination/plan'],
  membership: ['/account/membership'],
}

export function isProductPathVisible(path) {
  const pathname = path.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/'
  return !Object.entries(featurePaths).some(([feature, roots]) => !PRODUCT_FEATURES[feature] && roots.some(root => pathname === root || pathname.startsWith(`${root}/`)))
}
