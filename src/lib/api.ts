import { validateApiBase } from './apiConfig';
export const cloudMode = import.meta.env.VITE_DATA_MODE === 'cloud';
export const windowsLocalMode = import.meta.env.VITE_DATA_MODE === 'windows-local';
export const apiBase = validateApiBase(
  import.meta.env.VITE_API_BASE_URL || '/api',
  import.meta.env.PROD,
  import.meta.env.VITE_APP_TARGET === 'android',
);
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function apiRequest<T>(path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(`${apiBase}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'include',
      signal: controller.signal,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok)
      throw new ApiError(
        typeof result?.message === 'string' ? result.message : '服务器请求失败',
        response.status,
      );
    if (!result) throw new ApiError('服务器响应格式无效', 502);
    return result as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new Error('无法连接后端。未提交内容会保留，请检查网络后重试。');
  } finally {
    clearTimeout(timeout);
  }
}
