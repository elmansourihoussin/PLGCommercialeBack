export const withBaseUrl = (path?: string | null) => {
  if (!path) {
    return path ?? null;
  }
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const base = process.env.APP_BASE_URL?.trim();
  if (!base) {
    return path;
  }
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
};
