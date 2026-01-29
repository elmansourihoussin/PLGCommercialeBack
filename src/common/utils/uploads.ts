import { isAbsolute, join, resolve } from 'path';

export const getUploadsDir = () => {
  const raw = process.env.UPLOADS_DIR?.trim();
  if (!raw) {
    return join(process.cwd(), 'uploads');
  }
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
};

export const getUploadsUrlBase = () => {
  const raw = process.env.UPLOADS_URL_BASE?.trim();
  if (!raw) {
    return '/uploads';
  }
  return raw.startsWith('/') ? raw : `/${raw}`;
};
