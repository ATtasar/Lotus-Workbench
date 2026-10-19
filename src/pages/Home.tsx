import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Bell,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../state/AppContext';
import { calendarEvents, folderPath, hiddenFolder, shuffled, taskReminders } from '../data/domain';
import { useNow } from '../lib/useNow';
import { shortDate } from '../lib/date';
import { Empty, ItemArt, Progress, SectionTitle, Stars } from '../components/common';
import { EventRow, WeekCalendar } from '../components/CalendarParts';
import { eventsForDate } from '../data/calendar';

export function Home() {
  const { db, navigate, setModal, selectedDate } = useApp();
  const now = useNow();
  const due = db.settings.remindersEnabled
    ? taskReminders(db).filter((t) => new Date(t.reminder.at).getTime() <= now).length
    : 0;
  const orders = db.orders
    .filter((o) => !o.archived && o.status !== '已完成')
    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))
    .slice(0, 3);
  const featured = db.items.filter(
    (i) => i.featured && !i.archived && !hiddenFolder(db.folders, i.folderId),
  );
  const signature = featured.map((i) => i.id).join(',');
  const [ids, setIds] = useState<string[]>(() =>
    shuffled(featured)
      .slice(0, 5)
      .map((i) => i.id),
  );
  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);
  useEffect(() => {
    setIds(
      shuffled(featured)
        .slice(0, 5)
        .map((i) => i.id),
    );
    setIndex(0);
  }, [signature]);
  const slides = ids.map((id) => featured.find((i) => i.id === id)).filter((i) => !!i);
  const selected = slides[index % (slides.length || 1)];
  const step = (delta: number) => setIndex((i) => (i + delta + slides.length) % slides.length);
  const events = eventsForDate(db, selectedDate).sort(
    (a, b) => (a.source === 'task' ? 0 : 1) - (b.source === 'task' ? 0 : 1),
  );
  const [showDay, setShowDay] = useState(false);
  const prevDate = useRef(selectedDate);
  useEffect(() => {
    if (prevDate.current !== selectedDate) {
      setShowDay(true);
      prevDate.current = selectedDate;
    }
  }, [selectedDate]);
  return (
    <div className="home-page">
      <header className="home-header">
        <div className="home-brand">
          <span className="brand-seal" aria-hidden="true" />
          <h1>总览</h1>
        </div>
        <div className="home-tools">
          <button
            className="icon-button"
            aria-label="全局搜索"
            onClick={() => setModal({ kind: 'search' })}
          >
            <Search size={20} />
          </button>
          <button
            className="icon-button"
            aria-label="快速新建"
            onClick={() => setModal({ kind: 'create' })}
          >
            <Plus size={21} />
          </button>
          <button
            className="icon-button reminder-icon"
            aria-label="查看提醒"
            onClick={() => setModal({ kind: 'reminders' })}
          >
            <Bell size={18} />
            {due > 0 && <span>{due > 9 ? '9+' : due}</span>}
          </button>
        </div>
      </header>
      <main className="home-content">
        <WeekCalendar onSelect={() => setShowDay(true)} />
        {showDay && (
          <section className="paper day-peek">
            <div className="peek-heading">
              <span>
                {shortDate(selectedDate)} · {events.length} 项日程
              </span>
              <button className="text-button" onClick={() => setShowDay(false)}>
                收起
              </button>
            </div>
            {events.length ? (
              <>
                {events.slice(0, 3).map((e) => (
                  <EventRow key={e.id} event={e} />
                ))}
                {events.length > 3 && (
                  <button className="text-button" onClick={() => navigate({ page: 'calendar' })}>
                    查看全部 {events.length} 项
                  </button>
                )}
              </>
            ) : (
              <p className="muted small">当日暂无日程。</p>
            )}
          </section>
        )}
        <section className="paper home-orders">
          <SectionTitle
            title="订单进度"
            label="全部订单"
            onClick={() => navigate({ page: 'orders' })}
          />
          {orders.length ? (
            orders.map((o, i) => (
              <button
                className="home-order"
                key={o.id}
                onClick={() => navigate({ page: 'orders', detail: 'order', id: o.id })}
              >
                <span className={`order-glyph glyph-${o.type === '购买商品' ? 2 : i % 2}`}>
                  <span>{o.name.slice(0, 1)}</span>
                </span>
                <div className="home-order-info">
                  <div>
                    <strong>{o.name}</strong>
                    <span className="order-state">{o.steps[o.stage]}</span>
                  </div>
                  <small>
                    {o.number || o.type}
                    <span>·</span>
                    {o.party || '未填写交易对象'}
                  </small>
                  <Progress compact order={o} />
                </div>
                <ChevronRight size={15} />
              </button>
            ))
          ) : (
            <Empty
              title="此刻没有进行中的订单"
              action={() => setModal({ kind: 'order' })}
              label="记录新订单"
            />
          )}
        </section>
        <section className="paper showcase">
          <SectionTitle
            title="收纳展示"
            label="查看全部"
            onClick={() => navigate({ page: 'storage' })}
          />
          {selected ? (
            <>
              <div
                className="card-stack"
                onTouchStart={(e) => {
                  touchX.current = e.touches[0].clientX;
                }}
                onTouchEnd={(e) => {
                  if (
                    touchX.current !== null &&
                    slides.length > 1 &&
                    Math.abs(e.changedTouches[0].clientX - touchX.current) > 40
                  )
                    step(e.changedTouches[0].clientX < touchX.current ? 1 : -1);
                  touchX.current = null;
                }}
              >
                <div className="stack-back back-one" />
                {slides.length > 1 && (
                  <div className="stack-back back-two">
                    <ItemArt item={slides[(index + 1) % slides.length]} />
                  </div>
                )}
                <button
                  className="showcase-card"
                  aria-label={`查看${selected.name}`}
                  onClick={() => navigate({ page: 'storage', detail: 'item', id: selected.id })}
                >
                  <div className="showcase-image">
                    <ItemArt item={selected} />
                  </div>
                  <div className="showcase-caption">
                    <div>
                      <small>
                        {folderPath(db.folders, selected.folderId)
                          .map((f) => f.name)
                          .join(' / ') || '我的收藏'}
                      </small>
                      <h3>{selected.name}</h3>
                    </div>
                    <ArrowUpRight size={23} />
                  </div>
                  <div className="showcase-description">
                    <span>{selected.description || '未填写物品描述'}</span>
                    {selected.rating !== null && <Stars value={selected.rating} />}
                  </div>
                </button>
              </div>
              <div className="carousel-controls">
                <button
                  className="icon-button"
                  aria-label="上一件收藏"
                  disabled={slides.length < 2}
                  onClick={() => step(-1)}
                >
                  <ChevronLeft size={17} />
                </button>
                <div className="carousel-dots">
                  {slides.map((item, i) => (
                    <button
                      key={item.id}
                      aria-label={`展示第${i + 1}件收藏`}
                      aria-pressed={i === index}
                      className={i === index ? 'active' : ''}
                      onClick={() => setIndex(i)}
                    />
                  ))}
                </div>
                <button
                  className="icon-button"
                  aria-label="下一件收藏"
                  disabled={slides.length < 2}
                  onClick={() => step(1)}
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </>
          ) : (
            <Empty
              title="暂无首页展示物品"
              description="在物品详情中开启「加入首页展示」后显示。"
              label="去选择展示物品"
              action={() => navigate({ page: 'storage' })}
              icon={<Sparkles size={24} />}
            />
          )}
        </section>
      </main>
    </div>
  );
}
