import { Check, Bell, ChevronLeft, ChevronRight } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { stamp } from '../data/domain';
import { eventsForDate, calendarRecords } from '../data/calendar';
import { addDays, dateKey, monthDays, parseDate, weekDays, weekday } from '../lib/date';
import type { CalendarEvent } from '../data/types';

export function DateGrid({
  mode = 'week',
  onSelect,
  scope = 'all',
  eventFilter,
}: {
  mode?: 'month' | 'week' | 'day';
  onSelect?: (date: string) => void;
  scope?: 'all' | 'orders';
  eventFilter?: (event: CalendarEvent) => boolean;
}) {
  const { db, selectedDate, setSelectedDate } = useApp();
  const today = dateKey();
  const days =
    mode === 'month'
      ? monthDays(selectedDate, db.settings.weekStart)
      : mode === 'week'
        ? weekDays(selectedDate, db.settings.weekStart)
        : [selectedDate];
  const dayEvents = new Map(
    days.map((day) => [
      day,
      eventsForDate(db, day, scope).filter((e) => !eventFilter || eventFilter(e)),
    ]),
  );
  const has = new Set(days.filter((day) => dayEvents.get(day)?.length));
  const weekLabels = weekDays(selectedDate, db.settings.weekStart).map((d) => weekday(d));
  return (
    <div className={`date-grid ${mode}`}>
      <div className="weekday-labels">
        {mode !== 'day' && weekLabels.map((l) => <span key={l}>{l}</span>)}
      </div>
      <div className="date-buttons">
        {days.map((day) => (
          <button
            key={day}
            aria-label={`${day}${has.has(day) ? ' 有日程' : ''}`}
            aria-pressed={selectedDate === day}
            className={`${selectedDate === day ? 'selected' : ''} ${today === day ? 'today' : ''} ${day.slice(0, 7) !== selectedDate.slice(0, 7) ? 'outside' : ''}`}
            onClick={() => {
              setSelectedDate(day);
              onSelect?.(day);
            }}
          >
            <span>
              {mode === 'day'
                ? `${parseDate(day).getMonth() + 1}月${parseDate(day).getDate()}日 · 周${weekday(day)}`
                : parseDate(day).getDate()}
            </span>
            <span className="date-platform-marks" aria-hidden="true">
              {[...new Set(dayEvents.get(day)?.map((e) => e.color || '#777777'))]
                .slice(0, 3)
                .map((color) => (
                  <i
                    key={color}
                    style={{ backgroundColor: color }}
                    title={dayEvents
                      .get(day)
                      ?.filter((e) => e.color === color)
                      .map(
                        (e) =>
                          `${e.platform || '未指定平台'} · ${e.role === 'start' ? '开始' : e.role === 'end' ? '截止' : e.role === 'active' ? '排期' : '节点'}`,
                      )
                      .join('；')}
                  />
                ))}
              {(dayEvents.get(day)?.length || 0) > 0 && (
                <b>
                  {dayEvents.get(day)?.some((e) => e.role === 'start')
                    ? dayEvents.get(day)?.some((e)=>e.role==='end') ? '始止' : '始'
                    : dayEvents.get(day)?.some((e) => e.role === 'end')
                      ? '止'
                      : ''}
                </b>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
export function WeekCalendar({ onSelect }: { onSelect?: (date: string) => void }) {
  const { selectedDate, setSelectedDate, navigate } = useApp();
  const d = parseDate(selectedDate);
  return (
    <section className="paper home-calendar">
      <div className="calendar-heading">
        <button
          className="month-label"
          aria-label="进入完整日历"
          onClick={() => navigate({ page: 'calendar' })}
        >
          <strong>
            {String(d.getMonth() + 1).padStart(2, '0')}
            <span>月</span>
          </strong>
          <small>
            {d.getFullYear()}
            <i />
          </small>
        </button>
        <div className="calendar-arrows">
          <button
            className="icon-button"
            aria-label="上一周"
            onClick={() => setSelectedDate(addDays(selectedDate, -7))}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="下一周"
            onClick={() => setSelectedDate(addDays(selectedDate, 7))}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <DateGrid onSelect={onSelect} />
    </section>
  );
}
export function EventRow({ event }: { event: CalendarEvent }) {
  const { db, update, navigate, setModal, toast } = useApp();
  const open = () =>
    event.source === 'item' && event.itemId
      ? navigate({ page: 'storage', detail: 'item', id: event.itemId })
      : event.orderId
        ? navigate({ page: 'orders', detail: 'order', id: event.orderId })
        : setModal({ kind: 'task', id: event.taskId });
  const record = calendarRecords(db).find((r) =>
    event.source === 'item'
      ? r.itemId === event.itemId
      : r.source === 'order' && r.orderId === event.orderId,
  );
  return (
    <div
      className={`event-row ${event.done && event.source === 'task' ? 'done' : ''} ${event.source !== 'task' ? 'calendar-record-row' : ''}`}
    >
      {event.source === 'task' ? (
        <button
          className={`task-check ${event.done ? 'checked' : ''}`}
          aria-label={`${event.done ? '取消完成' : '完成'}${event.name}`}
          onClick={() => {
            update((d) => ({
              ...d,
              tasks: d.tasks.map((t) =>
                t.id === event.taskId ? stamp({ ...t, done: !t.done }) : t,
              ),
            }));
            toast(event.done ? '任务已恢复' : '任务已完成');
          }}
        >
          {event.done && <Check size={13} />}
        </button>
      ) : (
        <i className="order-event-dot" style={{ borderColor: event.color || '#777777' }} />
      )}
      <button
        className="event-main"
        onClick={open}
        aria-label={`${event.name} ${event.time || '全天'} · ${event.source === 'item' ? '买卖记录' : event.orderId ? '订单日程' : '个人任务'}`}
      >
        <strong>{event.name}</strong>
        <small>
          {event.time || '全天'}
          <span>·</span>
          {event.source === 'item' ? '买卖记录' : event.orderId ? '订单日程' : '个人任务'}
          {event.platform && <em style={{ color: event.color }}>{event.platform}</em>}
          {event.reminder?.enabled && <Bell size={11} />}
        </small>
        {event.source !== 'task' && record && (
          <span className="calendar-record-period">
            {record.start} — {record.end || '截止未设置'}
          </span>
        )}
      </button>
      {event.source === 'item' && event.orderId && (
        <button
          className="text-button small"
          aria-label={`查看${event.name}关联订单`}
          onClick={() => navigate({ page: 'orders', detail: 'order', id: event.orderId! })}
        >
          订单
        </button>
      )}
      {event.taskId && (
        <button
          className="text-button small"
          aria-label={`编辑${event.name}`}
          onClick={() => setModal({ kind: 'task', id: event.taskId })}
        >
          编辑
        </button>
      )}
    </div>
  );
}
