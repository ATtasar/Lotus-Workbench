// Shared original desktop data model and validation. No UI changes.
const dateStr = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const parseDate = (s) => new Date(s + 'T12:00:00');
const allStages = (o) => [...o.stages, '退单'];
export function initialData() {
  return {
    version: 1,
    appearanceVersion: 2,
    platforms: [],
    clients: [],
    archivedClients: [],
    orders: [],
    templates: [],
    assets: [],
    toolTemplates: [],
    current: '',
    profile: { name: '接稿工作台', artist: '管理员', tagline: '' },
  };
}
export function validateBackup(raw) {
  const fail = (message) => {
    throw new Error('备份格式无效：' + message);
  };
  if (
    !raw ||
    raw.version !== 1 ||
    !raw.profile ||
    typeof raw.profile.name !== 'string' ||
    typeof raw.profile.artist !== 'string' ||
    typeof raw.profile.tagline !== 'string'
  )
    fail('缺少工作室资料或版本不兼容');
  for (const key of ['platforms', 'clients', 'orders', 'templates', 'assets', 'toolTemplates'])
    if (!Array.isArray(raw[key])) fail('缺少 ' + key);
  raw.archivedClients ||= [];
  if (!Array.isArray(raw.archivedClients)) fail('单主历史不正确');
  const safeId = (id) => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id),
    str = (v) => typeof v === 'string' && v.length <= 30000,
    num = (v, max = 10000000) => Number.isFinite(v) && v >= 0 && v <= max;
  const color = (v) => /^#[0-9a-f]{6}$/i.test(v),
    safeImage = (src) =>
      typeof src === 'string' &&
      (/^data:image\/(png|jpeg|webp|gif|bmp);base64,[a-z0-9+/=\r\n]+$/i.test(src) ||
        (() => {
          if (!src.startsWith('data:image/svg+xml;charset=utf-8,')) return false;
          try {
            const s = decodeURIComponent(src.split(',').slice(1).join(','));
            return (
              s.startsWith('<svg ') &&
              !/(script|foreignObject|href\s*=|on\w+\s*=|https?:|url\s*\()/i.test(
                s
                  .replace('http://www.w3.org/2000/svg', '')
                  .replace(/url\(\s*#[a-z0-9_-]+\s*\)/gi, ''),
              )
            );
          } catch {
            return false;
          }
        })());
  for (const key of [
    'platforms',
    'clients',
    'archivedClients',
    'orders',
    'templates',
    'assets',
    'toolTemplates',
  ]) {
    if (raw[key].length > 10000) fail('记录数量过多');
    const ids = new Set();
    for (const item of raw[key]) {
      if (!item || !safeId(item.id) || ids.has(item.id)) fail('记录编号不合法或重复');
      ids.add(item.id);
    }
  }
  const platforms = new Set(raw.platforms.map((p) => p.id)),
    clients = new Set([...raw.clients, ...raw.archivedClients].map((c) => c.id));
  for (const p of raw.platforms)
    if (!str(p.name) || !p.name.trim() || !color(p.color) || !num(p.fee, 100))
      fail('平台信息不正确');
  for (const c of [...raw.clients, ...raw.archivedClients])
    if (
      !str(c.name) ||
      !Array.isArray(c.platforms) ||
      !c.platforms.length ||
      c.platforms.some((id) => !platforms.has(id)) ||
      ['preferences', 'dislikes', 'requirements', 'notes'].some((k) => !str(c[k]))
    )
      fail('单主信息不正确');
  const validDate = (s) =>
    typeof s === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(parseDate(s).getTime()) &&
    dateStr(parseDate(s)) === s;
  for (const [type, items] of [
    ['orders', raw.orders],
    ['templates', raw.templates],
  ])
    for (const o of items) {
      if (
        !str(o.title) ||
        !o.title.trim() ||
        !str(o.category) ||
        !str(o.requirements) ||
        !platforms.has(o.platform) ||
        !num(o.deposit) ||
        !num(o.balance) ||
        !num(o.fee, 100)
      )
        fail('稿件基本信息不正确');
      if (
        !Array.isArray(o.stages) ||
        o.stages[0] !== '未开始' ||
        o.stages.at(-2) !== '成图' ||
        o.stages.at(-1) !== '完成' ||
        new Set(o.stages).size !== o.stages.length ||
        o.stages.some((s) => !['未开始', '草稿', '线稿', '上色', '成图', '完成'].includes(s))
      )
        fail('流程信息不正确');
      if (
        !Array.isArray(o.images) ||
        o.images.length > 12 ||
        o.images.some((src) => !safeImage(src))
      )
        fail('参考图片格式不正确');
      if (!Array.isArray(o.extras) || o.extras.some((x) => !str(x.name) || !num(x.amount)))
        fail('服务金额不正确');
      if (
        type === 'orders' &&
        (!clients.has(o.client) ||
          !validDate(o.start) ||
          !validDate(o.due) ||
          o.start > o.due ||
          !allStages(o).includes(o.status) ||
          typeof o.paid !== 'boolean' ||
          !str(o.notes))
      )
        fail('稿件日期、单主或状态不正确');
      if (type === 'templates' && (!num(o.duration, 3650) || o.duration < 1))
        fail('模板工期不正确');
    }
  for (const a of raw.assets) if (!str(a.name) || !safeImage(a.src)) fail('素材不正确');
  for (const t of raw.toolTemplates) {
    if (!str(t.name) || !['receipt', 'card', 'layout'].includes(t.kind)) fail('组件模板不正确');
    if (t.kind === 'layout') {
      const l = t.layout;
      if (
        !l ||
        !num(l.width, 4000) ||
        l.width < 200 ||
        !num(l.height, 4000) ||
        l.height < 200 ||
        !color(l.bg) ||
        !Array.isArray(l.items) ||
        l.items.some(
          (x) =>
            !safeImage(x.src) ||
            !str(x.name) ||
            !Number.isFinite(x.x) ||
            !Number.isFinite(x.y) ||
            !num(x.scale, 200) ||
            x.scale < 1 ||
            !Number.isFinite(x.rotation) ||
            Math.abs(x.rotation) > 180,
        )
      )
        fail('排版模板不正确');
    } else if (
      !color(t.accent) ||
      ['brand', 'handle', 'message', 'subtitle'].some((k) => !str(t[k])) ||
      (t.image && !safeImage(t.image)) ||
      ['membership', 'cardNumber', 'itemText'].some((k) => t[k] !== undefined && !str(t[k]))
    )
      fail('小票或会员卡模板不正确');
  }
  if (raw.watermarkMark && !safeImage(raw.watermarkMark)) fail('水印格式不正确');
  raw.current = raw.orders.some((o) => o.id === raw.current)
    ? raw.current
    : raw.orders[0]?.id || '';
  return raw;
}
