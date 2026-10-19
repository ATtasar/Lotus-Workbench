let mobileWeekDate = today();
let mobileMonthDate = today();
let mobileToolPane = 'edit';
const originalMobileAction = handleAction;
const originalToolEditor = renderToolEditor;
function mobileEmpty(title, description, action = '', label = '', imageName = 'orders') {
  return `<div class="mobile-empty">${icon(imageName)}<h3>${title}</h3><p>${description}</p>${action ? btn(icon('plus') + label, action, 'primary') : ''}</div>`;
}
function mobileAgendaItem(o, kind = '截稿') {
  return `<button class="agenda-item" data-action="order-detail" data-id="${o.id}" style="--platform:${platform(o.platform).color}"><span class="agenda-marker"></span><span class="agenda-copy"><strong>${e(o.title)}</strong><small>${e(client(o.client).name)} · ${e(platform(o.platform).name)}</small></span><span class="agenda-kind">${kind}</span>${icon('chevron')}</button>`;
}
function mobileRender() {
  const shortNames = {
    home: '主页',
    orders: '稿件',
    clients: '单主',
    calendar: '日历',
    tools: '组件',
    templates: '模板',
  };
  const renderers = {
    home: renderHome,
    orders: renderOrders,
    clients: renderClients,
    calendar: renderCalendar,
    templates: renderTemplates,
    tools: renderTools,
  };
  $('#app').innerHTML =
    `<div class="mobile-shell shell"><header class="mobile-topbar topbar"><button class="mobile-brand" data-action="nav" data-page="home"><span class="mobile-brand-mark">稿</span><span><strong>${e(data.profile.name)}</strong><small>手机工作空间</small></span></button><div class="mobile-header-actions"><span id="save-status" class="mobile-save"></span>${iconBtn('bell', 'reminders', '截稿提醒')}${iconBtn('settings', 'settings', '工作台设置')}</div></header><main class="content mobile-content" id="main-content">${renderers[page]()}</main><nav class="nav mobile-tabs" aria-label="主要导航">${navItems.map(([id, label, ic]) => `<button type="button" data-action="nav" data-page="${id}" class="${page === id ? 'active' : ''}" aria-label="${label}" ${page === id ? 'aria-current="page"' : ''}><span class="tab-icon">${icon(ic)}</span><span class="tab-label">${shortNames[id]}</span></button>`).join('')}</nav></div>`;
  updateSaveStatus();
  if (page === 'tools' && tool) requestAnimationFrame(drawCurrentTool);
}
function mobileIntro(_eyebrow, title, desc, action = 'new-order', label = '新建稿件') {
  const counts = {
    orders: data.orders.length,
    clients: data.clients.length,
    templates: data.templates.length,
  };
  const count = counts[page];
  const shortLabel = { 新建稿件: '新建', 新建单主: '新建', 新建模板: '新建' }[label] || label;
  return `<div class="page-intro mobile-intro"><div><div class="page-heading"><h1>${title}</h1>${count !== undefined ? `<span class="page-count">${count}</span>` : ''}</div><p>${desc}</p></div>${action ? btn(icon('plus') + shortLabel, action, 'primary') : ''}</div>`;
}
function mobileHome() {
  const d = addDays(monday(now()), weekOffset * 7),
    end = addDays(d, 6),
    startString = dateStr(d),
    endString = dateStr(end);
  if (mobileWeekDate < startString || mobileWeekDate > endString)
    mobileWeekDate = today() >= startString && today() <= endString ? today() : startString;
  const active = data.orders.filter((o) => !['完成', '退单'].includes(o.status));
  const current = data.orders.find((o) => o.id === data.current) || active[0] || data.orders[0];
  const due = active.filter((o) => o.due >= startString && o.due <= endString).length;
  const dayEvents = active.flatMap((o) => [
    ...(o.start === mobileWeekDate ? [{ o, kind: '开始' }] : []),
    ...(o.due === mobileWeekDate ? [{ o, kind: '截稿' }] : []),
  ]);
  return (
    mobileIntro('', '工作概览', `${shortDate(today())}，星期${'日一二三四五六'[now().getDay()]}`) +
    `<div class="mobile-summary"><div><span>待处理稿件</span><strong>${String(active.length).padStart(2, '0')}<small>份</small></strong></div><div><span>本周截稿</span><strong>${String(due).padStart(2, '0')}<small>份</small></strong></div><span class="summary-symbol">${icon('orders')}</span></div>` +
    `<section class="panel week-panel"><div class="panel-header"><div class="panel-title"><h2>本周排期</h2><span class="mobile-subdate">${d.getMonth() + 1}.${d.getDate()} — ${end.getMonth() + 1}.${end.getDate()}</span></div><div class="week-toolbar">${iconBtn('left', 'week-prev', '上一周')}${btn('本周', 'week-today', 'small')}${iconBtn('chevron', 'week-next', '下一周')}</div></div><div class="mobile-week-strip">${Array.from(
      { length: 7 },
      (_, i) => {
        const date = addDays(d, i),
          s = dateStr(date),
          events = active.filter((o) => o.due === s || o.start === s);
        return `<button class="mobile-week-day ${s === mobileWeekDate ? 'selected' : ''} ${s === today() ? 'is-today' : ''}" data-action="mobile-week-day" data-date="${s}" aria-label="${shortDate(s)}，${events.length}项排期" aria-pressed="${s === mobileWeekDate}"><span>${'一二三四五六日'[i]}</span><strong>${date.getDate()}</strong><span class="week-dots">${
          events
            .slice(0, 3)
            .map((o) => `<i style="background:${platform(o.platform).color}"></i>`)
            .join('') || '<i class="no-dot"></i>'
        }</span></button>`;
      },
    ).join(
      '',
    )}</div><div class="mobile-agenda"><div class="agenda-heading"><span>${shortDate(mobileWeekDate)}<small>${dayEvents.length} 项安排</small></span>${btn('查看月历 ' + icon('chevron'), 'nav', 'small', 'data-page="calendar"')}</div>${dayEvents.map(({ o, kind }) => mobileAgendaItem(o, kind)).join('') || '<div class="agenda-empty">当日暂无开始或截稿安排</div>'}</div></section>` +
    `<section class="panel current-panel"><div class="panel-header"><div class="current-title"><h2>当前稿件</h2>${current ? `<span class="badge">${e(current.status)}</span>` : ''}</div><div class="row">${current ? btn('切换', 'choose-current', 'small') : ''}${current ? iconBtn('edit', 'edit-order', '编辑当前稿件', `data-id="${current.id}"`) : ''}</div></div>${current ? renderCurrent(current) : mobileEmpty('暂无当前稿件', '新建稿件后，可查看参考图、要求与进度。', '', '', 'image')}</section>`
  );
}
function mobileOrders() {
  const items = filtered(data.orders).sort((a, b) => a.due.localeCompare(b.due));
  return (
    mobileIntro('', '稿件管理', '管理稿件、制作进度与交付日期。') +
    toolbar('orders') +
    `<div class="mobile-records">${items.map((o) => `<article class="mobile-order-card" data-action="order-detail" data-id="${o.id}"><div class="mobile-order-heading"><input type="checkbox" class="entity-select" data-id="${o.id}" ${selected.has(o.id) ? 'checked' : ''} aria-label="选择${e(o.title)}"><span class="platform-tag" style="--platform:${platform(o.platform).color}"><i class="dot"></i>${e(platform(o.platform).name)}</span><span class="grow"></span><span class="badge ${o.status === '未开始' ? 'neutral' : ''}">${e(o.status)}</span></div><div class="mobile-order-main">${o.images[0] ? `<div class="mobile-order-thumb"><img src="${e(o.images[0])}" alt="稿件参考图"></div>` : `<div class="mobile-order-thumb placeholder">${icon('image')}</div>`}<div><h3>${e(o.title)}</h3><p>${e(client(o.client).name)}<span>·</span>${e(o.category)}</p><small>${shortDate(o.due)} 截稿${o.due < today() && !['完成', '退单'].includes(o.status) ? ' · 已逾期' : ''}</small></div>${icon('chevron')}</div><div class="mobile-order-foot"><strong>${money(gross(o))}<small>${o.paid ? '已结清' : '定金 ' + money(o.deposit)}</small></strong>${btn(icon('edit') + '编辑', 'edit-order', 'small', `data-id="${o.id}"`)}</div></article>`).join('') || mobileEmpty('暂无稿件', '添加稿件后，排期和单主资料将自动关联。', 'new-order', '新建稿件')}</div>${items.length ? `<p class="mobile-list-note">共 ${items.length} 份稿件</p>` : ''}`
  );
}
function mobileClients() {
  const items = filtered(data.clients);
  return (
    mobileIntro('', '单主管理', '管理单主资料与关联稿件。', 'new-client', '新建单主') +
    toolbar('clients') +
    `<div class="mobile-records">${
      items
        .map((c) => {
          const orders = data.orders.filter((o) => o.client === c.id),
            ongoing = orders.filter((o) => !['完成', '退单'].includes(o.status)).length;
          return `<article class="mobile-client-card entity-card" data-action="client-detail" data-id="${c.id}"><div class="color-strip" style="background:${clientGradient(c)}"></div><div class="mobile-client-heading"><span class="avatar">${e(c.name.slice(0, 1))}</span><div><h3>${e(c.name)}</h3><div class="mobile-client-platforms">${c.platforms.map((id) => `<span class="platform-tag" style="--platform:${platform(id).color}"><i class="dot"></i>${e(platform(id).name)}</span>`).join('')}</div></div><span class="grow"></span><input type="checkbox" class="entity-select" data-id="${c.id}" ${selected.has(c.id) ? 'checked' : ''} aria-label="选择${e(c.name)}"></div><p class="mobile-client-pref">${e(c.preferences || '未填写偏好')}</p><div class="mobile-client-foot"><span>关联稿件<strong>${orders.length}<small>份</small></strong></span><span>委托总额<strong>${money(orders.filter((o) => o.status !== '退单').reduce((n, o) => n + gross(o), 0))}</strong></span><span class="mobile-client-progress">${ongoing} 份进行中 ${icon('chevron')}</span></div></article>`;
        })
        .join('') ||
      mobileEmpty(
        '暂无单主',
        '添加平台与单主资料，再关联稿件。',
        'new-client',
        '新建单主',
        'clients',
      )
    }</div>`
  );
}
function mobileTemplates() {
  const items = filtered(data.templates);
  return (
    mobileIntro('', '稿件模板', '复用价格、工期与制作流程。', 'new-template', '新建模板') +
    toolbar('templates') +
    `<div class="mobile-records">${items.map((t) => `<article class="mobile-template-card entity-card template-card" data-action="edit-template" data-id="${t.id}"><div class="color-strip" style="background:${platform(t.platform).color}"></div><input type="checkbox" class="entity-select entity-check" data-id="${t.id}" ${selected.has(t.id) ? 'checked' : ''} aria-label="选择${e(t.title)}"><div class="mobile-template-main"><div class="mobile-template-image"><img src="${e(t.images[0] || artwork())}" alt="模板参考图"></div><div><span class="platform-tag" style="--platform:${platform(t.platform).color}"><i class="dot"></i>${e(platform(t.platform).name)}</span><h3>${e(t.title)}</h3><p>${e(t.category)} · ${t.duration} 天 · ${t.stages.length} 个流程节点</p></div></div><div class="mobile-template-bottom"><strong>${money(gross(t))}<small>平台费 ${t.fee}%</small></strong>${btn('使用模板 ' + icon('arrow'), 'use-template', 'primary small', `data-id="${t.id}"`)}</div></article>`).join('') || mobileEmpty('暂无稿件模板', '保存常用项目，创建稿件时可直接套用。', 'new-template', '新建模板', 'templates')}</div>`
  );
}
function mobileCalendar() {
  const y = monthDate.getFullYear(),
    m = monthDate.getMonth(),
    prefix = `${y}-${String(m + 1).padStart(2, '0')}`;
  if (!mobileMonthDate.startsWith(prefix))
    mobileMonthDate = today().startsWith(prefix) ? today() : `${prefix}-01`;
  const start = monday(new Date(y, m, 1)),
    days =
      Math.ceil((((new Date(y, m, 1).getDay() + 6) % 7) + new Date(y, m + 1, 0).getDate()) / 7) * 7;
  const orders = data.orders.filter((o) => !platformFilter || o.platform === platformFilter);
  const monthOrders = orders.filter((o) => o.due.startsWith(prefix) && o.status !== '退单');
  const selectedOrders = orders.filter((o) => o.due === mobileMonthDate);
  const total = monthOrders.reduce((n, o) => n + received(o), 0),
    expected = monthOrders.reduce((n, o) => n + net(o), 0);
  const groups = (key, mapper) => {
    const values = {};
    monthOrders.forEach((o) => {
      const id = o[key];
      if (!values[id])
        values[id] = {
          label: mapper(id),
          value: 0,
          color:
            key === 'platform'
              ? platform(id).color
              : ['#444444', '#888888', '#aaaaaa', '#cccccc'][Object.keys(values).length % 4],
        };
      values[id].value += received(o);
    });
    return Object.values(values).sort((a, b) => b.value - a.value);
  };
  return (
    mobileIntro('', '日历展示', '按截止日期查看排期与收入。') +
    `<section class="panel mobile-month-panel"><div class="mobile-month-head"><h2>${y}年${m + 1}月</h2><div class="row">${iconBtn('left', 'month-prev', '上个月')}${btn('本月', 'month-today', 'small')}${iconBtn('chevron', 'month-next', '下个月')}</div></div><div class="mobile-calendar-filter"><select class="filter" id="platform-filter" aria-label="日历平台筛选"><option value="">全部平台</option>${platformOptions(platformFilter)}</select><span>${monthOrders.length} 份稿件</span></div><div class="mobile-month-grid">${['一', '二', '三', '四', '五', '六', '日'].map((s) => `<div class="mobile-month-weekday">${s}</div>`).join('')}${Array.from(
      { length: days },
      (_, i) => {
        const d = addDays(start, i),
          s = dateStr(d),
          items = orders.filter((o) => o.due === s);
        return `<button class="mobile-month-day ${d.getMonth() !== m ? 'outside' : ''} ${s === today() ? 'is-today' : ''} ${s === mobileMonthDate ? 'selected' : ''}" data-action="mobile-month-day" data-date="${s}" aria-pressed="${s === mobileMonthDate}" aria-label="${shortDate(s)}，${items.length}份截稿"><span>${d.getDate()}</span><span class="month-dots">${items
          .slice(0, 3)
          .map((o) => `<i style="background:${platform(o.platform).color}"></i>`)
          .join('')}</span></button>`;
      },
    ).join(
      '',
    )}</div><div class="mobile-month-agenda"><div class="agenda-heading"><span>${shortDate(mobileMonthDate)}<small>${selectedOrders.length} 份截稿</small></span>${btn(icon('plus') + '新增', 'new-order-day', 'small', `data-date="${mobileMonthDate}"`)}</div>${selectedOrders.map((o) => mobileAgendaItem(o, o.status === '退单' ? '退单' : '截稿')).join('') || '<div class="agenda-empty">当日暂无截稿安排</div>'}</div></section><section class="income-section"><div class="income-title"><h2>本月收入统计</h2><span>${monthOrders.length} 份稿件</span></div><div class="mobile-income-total"><span>实收净额</span><strong>${money(total)}</strong><small>预计净收入 ${money(expected)}</small></div><p class="settings-note mobile-accounting-note">按截稿月份归集，扣除平台费；退单不计收入。</p><div class="income-cards"><article class="stat-card"><h3>平台收入</h3>${renderDonut(
      groups('platform', (id) => platform(id).name),
      total,
    )}</article><article class="stat-card"><h3>稿件类别收入</h3>${renderBars(groups('category', (id) => id))}</article><article class="stat-card"><h3>单主收入</h3>${renderBars(groups('client', (id) => client(id).name))}</article></div></section>`
  );
}
function mobileToolEditor() {
  const tabs = `<div class="mobile-tool-tabs" role="tablist" aria-label="组件操作"><button role="tab" data-action="mobile-tool-pane" data-pane="edit" aria-selected="${mobileToolPane === 'edit'}" class="${mobileToolPane === 'edit' ? 'active' : ''}">${icon('edit')}参数设置</button><button role="tab" data-action="mobile-tool-pane" data-pane="preview" aria-selected="${mobileToolPane === 'preview'}" class="${mobileToolPane === 'preview' ? 'active' : ''}">${icon('image')}效果预览</button></div>`;
  return originalToolEditor().replace(
    '<div class="tool-workspace">',
    `${tabs}<div class="tool-workspace" data-mobile-pane="${mobileToolPane}">`,
  );
}
render = mobileRender;
intro = mobileIntro;
renderHome = mobileHome;
renderOrders = mobileOrders;
renderClients = mobileClients;
renderTemplates = mobileTemplates;
renderCalendar = mobileCalendar;
renderToolEditor = mobileToolEditor;
handleAction = async function (action, el) {
  if (action === 'mobile-week-day') {
    mobileWeekDate = el.dataset.date;
    render();
    return;
  }
  if (action === 'mobile-month-day') {
    mobileMonthDate = el.dataset.date;
    const date = parseDate(mobileMonthDate);
    monthDate = new Date(date.getFullYear(), date.getMonth(), 1);
    render();
    return;
  }
  if (action === 'mobile-tool-pane') {
    mobileToolPane = el.dataset.pane;
    render();
    window.scrollTo(0, 0);
    return;
  }
  if (action === 'open-tool' || action === 'order-receipt') mobileToolPane = 'edit';
  return originalMobileAction(action, el);
};
