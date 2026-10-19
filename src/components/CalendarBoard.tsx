import { useState } from 'react';
import { Bell, ChevronLeft, ChevronRight, Palette, Plus } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { eventsForDate, ledgerSummary, periodDates } from '../data/calendar';
import { taskReminders } from '../data/domain';
import { addDays, dateKey, money, parseDate, shiftMonth, shortDate, weekday } from '../lib/date';
import { DateGrid, EventRow } from './CalendarParts';
import { Empty } from './common';
import type { CalendarEvent } from '../data/types';

export function CalendarBoard({ scope = 'all' }: { scope?: 'all' | 'orders' }) {
  const { db, selectedDate, setSelectedDate, setModal } = useApp();
  const [mode, setMode] = useState<'month' | 'week' | 'day'>('month');
  const [platform, setPlatform] = useState('');
  const [source, setSource] = useState('all');
  const filter = (e: CalendarEvent) =>
    (!platform || e.platform === platform) &&
    (source === 'all' ||
      (source === 'order' && (e.source === 'order' || (e.source === 'task' && !!e.orderId))) ||
      (source === 'item' && e.source === 'item') ||
      (source === 'task' && e.source === 'task'));
  const events = eventsForDate(db, selectedDate, scope).filter(filter);
  const d = parseDate(selectedDate);
  const [from, to] = periodDates(selectedDate, mode, db.settings.weekStart);
  const summary = ledgerSummary(db, from, to, platform);
  const change = (n: number) =>
    setSelectedDate(
      mode === 'month'
        ? shiftMonth(selectedDate, n)
        : addDays(selectedDate, n * (mode === 'week' ? 7 : 1)),
    );
  const platforms = [
    ...new Set(
      [
        ...db.platforms.map((p) => p.name),
        ...db.orders.map((o) => o.platform),
        ...db.items.filter((i) => i.calendarEnabled).map((i) => i.platform),
      ].filter(Boolean),
    ),
  ];
  return (
    <div className="calendar-board">
      <div className="calendar-topbar">
        <div className="segmented" aria-label="日历视图">
          {(['month', 'week', 'day'] as const).map((v, i) => (
            <button key={v} className={mode === v ? 'active' : ''} onClick={() => setMode(v)}>
              {['月', '周', '日'][i]}
            </button>
          ))}
        </div>
        <button className="text-button" onClick={() => setSelectedDate(dateKey())}>
          回到今天
        </button>
      </div>
      <div className="calendar-filters">
        <select aria-label="日历来源" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="all">全部记录</option>
          <option value="order">订单与节点</option>
          <option value="item">购买 / 售出物品</option>
          {scope === 'all' && <option value="task">任务</option>}
        </select>
        <select
          aria-label="日历平台筛选"
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
        >
          <option value="">全部平台</option>
          {platforms.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <button
          className="icon-button"
          aria-label="设置平台颜色"
          onClick={() => setModal({ kind: 'catalog' })}
        >
          <Palette size={18} />
        </button>
      </div>
      <section className="paper full-calendar">
        <div className="calendar-heading">
          <h2>
            {d.getFullYear()}
            <span>年</span> {d.getMonth() + 1}
            <span>月</span>
          </h2>
          <div className="calendar-arrows">
            <button
              className="icon-button"
              aria-label={
                scope === 'orders'
                  ? '上一订单日历周期'
                  : `上一${mode === 'month' ? '月' : mode === 'week' ? '周' : '天'}`
              }
              onClick={() => change(-1)}
            >
              <ChevronLeft size={19} />
            </button>
            <button
              className="icon-button"
              aria-label={
                scope === 'orders'
                  ? '下一订单日历周期'
                  : `下一${mode === 'month' ? '月' : mode === 'week' ? '周' : '天'}`
              }
              onClick={() => change(1)}
            >
              <ChevronRight size={19} />
            </button>
          </div>
        </div>
        <DateGrid mode={mode} scope={scope} eventFilter={filter} />
        <div className="calendar-mark-legend">
          <span>始：开始</span>
          <span>止：截止</span>
          <span>色条：平台 / 排期</span>
        </div>
      </section>
      <section className="ledger-panel" aria-label="日历收入支出汇总">
        <div className="ledger-heading">
          <h3>{mode === 'month' ? '本月' : mode === 'week' ? '本周' : '当日'}收支汇总</h3>
          <small>
            {summary.count} 笔 · {platform || '全部平台'}
          </small>
        </div>
        <div className="ledger-totals">
          <div>
            <span>收入</span>
            <strong data-testid="ledger-income">{money(summary.income)}</strong>
          </div>
          <div>
            <span>支出</span>
            <strong data-testid="ledger-expense">{money(summary.expense)}</strong>
          </div>
          <div>
            <span>净额</span>
            <strong>{money(summary.balance)}</strong>
          </div>
        </div>
        <details className="ledger-basis">
          <summary>统计口径：按开始日归集 · 关联项去重</summary>
          <p>
            收入按已收金额扣除平台费，支出按已付金额；定金按定金数额计入。未付款与退款状态的订单不计入。物品按记录价格计入，与已计入的同方向订单关联时不重复汇总。筛选来源仅影响日程列表。
          </p>
        </details>
      </section>
      {scope === 'all' && (
        <button className="reminder-banner" onClick={() => setModal({ kind: 'reminders' })}>
          <Bell size={18} />
          <div>
            <strong>
              {db.settings.remindersEnabled ? '应用内提醒已开启' : '应用内提醒已暂停'}
            </strong>
            <small>{taskReminders(db).length} 项待提醒任务</small>
          </div>
        </button>
      )}
      <section className="paper detail-section day-events">
        <div className="workspace-subheading">
          <h3>
            {shortDate(selectedDate)} · 周{weekday(selectedDate)}
          </h3>
          <button
            className="text-button"
            disabled={scope === 'orders' && !db.orders.length}
            onClick={() =>
              setModal({
                kind: 'task',
                date: selectedDate,
                orderId: scope === 'orders' ? db.orders[0]?.id : undefined,
              })
            }
          >
            <Plus size={14} />
            添加
          </button>
        </div>
        <p className="muted small">
          {events.length} 项记录 · {events.filter((e) => e.done).length} 项已完成
        </p>
        {events.length ? (
          events.map((e) => <EventRow key={e.id} event={e} />)
        ) : (
          <Empty title="当日暂无日程" description="订单、买卖记录与任务会按日期显示。" />
        )}
      </section>
    </div>
  );
}
