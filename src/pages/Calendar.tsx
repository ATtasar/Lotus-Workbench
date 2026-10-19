import { useApp } from '../state/AppContext';
import { PageHeader } from '../components/common';
import { CalendarBoard } from '../components/CalendarBoard';
export function Calendar() {
  const { setModal, selectedDate } = useApp();
  return (
    <main className="page calendar-page">
      <PageHeader title="日历" onAdd={() => setModal({ kind: 'task', date: selectedDate })} />
      <CalendarBoard />
    </main>
  );
}
