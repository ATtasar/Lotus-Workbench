import { AppProvider, useApp } from './state/AppContext';
import { Navigation } from './components/Navigation';
import { ModalHost } from './components/ModalHost';
import { Home } from './pages/Home';
import { OrderDetail } from './pages/Orders';
import { OrderWorkspace } from './pages/OrderWorkspace';
import { Storage, FolderDetail, ItemDetail } from './pages/Storage';
import { Calendar } from './pages/Calendar';
import { Settings } from './pages/Settings';
import { AuthGate } from './state/AuthGate';

function Shell() {
  const { route, db, modal, confirming } = useApp();
  let page;
  if (route.detail === 'order' && route.id) page = <OrderDetail key={route.id} id={route.id} />;
  else if (route.detail === 'folder' && route.id)
    page = <FolderDetail key={route.id} id={route.id} />;
  else if (route.detail === 'item' && route.id) page = <ItemDetail key={route.id} id={route.id} />;
  else
    switch (route.page) {
      case 'home':
        page = <Home />;
        break;
      case 'orders':
        page = <OrderWorkspace />;
        break;
      case 'storage':
        page = <Storage />;
        break;
      case 'calendar':
        page = <Calendar />;
        break;
      case 'settings':
        page = <Settings />;
        break;
    }
  return (
    <div className={`app-shell ${db.settings.compact ? 'dense' : ''}`}>
      <div
        className="app-content"
        inert={modal || confirming ? true : undefined}
        aria-hidden={modal || confirming ? true : undefined}
      >
        {page}
        <Navigation />
      </div>
      <ModalHost />
    </div>
  );
}
export default function App() {
  return (
    <AuthGate>
      <AppProvider>
        <Shell />
      </AppProvider>
    </AuthGate>
  );
}
