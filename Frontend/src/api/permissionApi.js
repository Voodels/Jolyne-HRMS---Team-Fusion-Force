const APP_PERMISSIONS_KEY = 'appPermissions';

export const DEFAULT_APP_PERMISSIONS = {
  allowAddCandidate: true,
  allowAddJob: true,
  allowAIService: true,
};

export const loadAppPermissions = () => {
  try {
    const stored = localStorage.getItem(APP_PERMISSIONS_KEY);
    if (!stored) return DEFAULT_APP_PERMISSIONS;
    return { ...DEFAULT_APP_PERMISSIONS, ...JSON.parse(stored) };
  } catch (error) {
    return DEFAULT_APP_PERMISSIONS;
  }
};

export const saveAppPermissions = (permissions) => {
  localStorage.setItem(APP_PERMISSIONS_KEY, JSON.stringify(permissions));
};

export const resetAppPermissions = () => {
  localStorage.removeItem(APP_PERMISSIONS_KEY);
};
