export const CORE_LICENSE_FEATURE_KEYS = [
  'license.benefitEncryptedStorage',
  'license.benefitUnlimitedHistory',
  'license.benefitCustomThemes',
  'license.benefitLifetimeUpdates',
] as const;

export const DIALOG_LICENSE_FEATURE_KEYS = [
  'license.benefitEncryptedStorage',
  'license.benefitUnlimitedHistory',
  'license.benefitCustomThemes',
  'license.benefitPrioritySupport',
  'license.benefitLifetimeUpdates',
] as const;

export function getLicenseTypeKey(type: string | null | undefined) {
  switch (type) {
    case 'Standard':
      return 'license.typeStandard';
    case 'Family':
      return 'license.typeFamily';
    case 'Enterprise':
      return 'license.typeEnterprise';
    default:
      return 'license.typeUnknown';
  }
}
