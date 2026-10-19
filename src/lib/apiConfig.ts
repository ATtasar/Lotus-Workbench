export function validateApiBase(value: string, production: boolean, android = false): string {
  const base = value.replace(/\/$/, '');
  if (base === '/api' && !android) return base;
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new Error('API 地址必须为 /api 或完整的 HTTPS 地址');
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !['http:', 'https:'].includes(url.protocol)
  )
    throw new Error('API 地址格式无效');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const octets = host.split('.').map(Number);
  const privateIp =
    /^\d+\.\d+\.\d+\.\d+$/.test(host) &&
    (octets[0] === 0 ||
      octets[0] === 10 ||
      octets[0] === 127 ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168));
  const local =
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === '::1' ||
    host === '::' ||
    /^(?:fc[\da-f]{2}|fd[\da-f]{2}|fe[89ab][\da-f]):/i.test(host) ||
    host.startsWith('::ffff:') ||
    privateIp;
  if (
    (production || android) &&
    (url.protocol !== 'https:' || local || (!host.includes('.') && !host.includes(':')))
  )
    throw new Error('正式 API 必须使用公网 HTTPS 地址，不能使用 localhost 或局域网 IP');
  return base;
}
