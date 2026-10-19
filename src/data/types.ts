export type Page = 'home' | 'orders' | 'storage' | 'calendar' | 'settings';
export type Route = { page: Page; detail?: 'order' | 'item' | 'folder'; id?: string };
export interface Entity {
  id: string;
  createdAt: string;
  updatedAt: string;
}
export interface Attachment extends Entity {
  name: string;
  mime: string;
  data: string;
  size: number;
}
export interface Review {
  rating: number | null;
  review: string;
  pros: string;
  cons: string;
}
export type OrderType = string;
export type FeeMode = 'fixed' | 'percent';
export type CashFlow = 'income' | 'expense' | 'none';
export interface NamedOption extends Entity {
  name: string;
}
export interface PlatformOption extends NamedOption {
  color: string;
}
export const ORDER_TYPES: OrderType[] = [
  '接稿',
  '约稿',
  '购买商品',
  '出售商品',
  '手工定制',
  '自定义',
];
export const STATUSES = ['待处理', '进行中', '等待确认', '待交付', '已完成'] as const;
export type Status = (typeof STATUSES)[number];
export interface Order extends Entity {
  queuePosition: number;
  counterpartyId: string | null;
  name: string;
  type: OrderType;
  customType: string;
  number: string;
  platform: string;
  description: string;
  party: string;
  contact: string;
  shopUrl: string;
  communication: string;
  amount: number | null;
  platformFeeMode: FeeMode;
  platformFee: number;
  platformColor: string;
  cashFlow: CashFlow;
  deposit: number | null;
  balance: number | null;
  payment: string;
  refund: string;
  startDate: string;
  dueDate: string;
  deliveryDate: string;
  actualDeliveryDate: string;
  shipDate: string;
  receiveDate: string;
  completedDate: string;
  status: Status;
  stage: number;
  steps: string[];
  archived: boolean;
  attachments: Attachment[];
  notes: string;
  links: string;
  history: { id: string; at: string; text: string }[];
}
export interface Reminder {
  enabled: boolean;
  at: string;
}
export interface Task extends Entity {
  name: string;
  orderId: string | null;
  date: string;
  time: string;
  done: boolean;
  notes: string;
  position: number;
  reminder: Reminder;
}
export interface Folder extends Entity, Review {
  name: string;
  parentId: string | null;
  description: string;
  tags: string[];
  purpose: string;
  cover: Attachment[];
  archived: boolean;
  merchant: string;
  shopUrl: string;
  contact: string;
  experience: string;
  service: string;
  packaging: string;
  shipping: string;
}
export interface Item extends Entity, Review {
  calendarEnabled: boolean;
  tradeKind: 'none' | 'purchase' | 'sale';
  startDate: string;
  dueDate: string;
  platformColor: string;
  name: string;
  folderId: string | null;
  description: string;
  tags: string[];
  spec: string;
  quantity: number;
  merchant: string;
  platform: string;
  purchaseDate: string;
  price: number | null;
  productUrl: string;
  location: string;
  notes: string;
  experience: string;
  featured: boolean;
  archived: boolean;
  attachments: Attachment[];
  illustration: string;
}
export interface OrderItemLink extends Entity {
  orderId: string;
  itemId: string;
}
export interface AppSettings extends Entity {
  name: string;
  bio: string;
  compact: boolean;
  weekStart: 'monday' | 'sunday';
  reminderMinutes: number;
  remindersEnabled: boolean;
}
export interface Counterparty extends Entity {
  requirements: string;
  preferences: string;
  avoidances: string;
  name: string;
  platform: string;
  role: string;
  contact: string;
  url: string;
  notes: string;
}
export interface OrderTemplate extends Entity {
  amount: number | null;
  platformFeeMode: FeeMode;
  platformFee: number;
  platformColor: string;
  cashFlow: CashFlow;
  startDate: string;
  dueDate: string;
  name: string;
  type: OrderType;
  customType: string;
  platform: string;
  description: string;
  notes: string;
  duration: number;
  steps: string[];
  tasks: { name: string; offset: number }[];
}
export interface Work extends Entity {
  name: string;
  category: '插画' | '手作' | '产品' | '其他';
  description: string;
  date: string;
  tags: string[];
  attachments: Attachment[];
  illustration: string;
  orderId: string | null;
}
export interface Database {
  version: 3;
  orderTypes: NamedOption[];
  platforms: PlatformOption[];
  orders: Order[];
  tasks: Task[];
  folders: Folder[];
  items: Item[];
  links: OrderItemLink[];
  settings: AppSettings;
  counterparties: Counterparty[];
  templates: OrderTemplate[];
  works: Work[];
}
export interface CalendarEvent {
  id: string;
  name: string;
  date: string;
  time: string;
  done: boolean;
  source: 'task' | 'order' | 'item';
  orderId: string | null;
  itemId?: string;
  platform?: string;
  color?: string;
  role?: 'start' | 'end' | 'milestone' | 'active' | 'task';
  taskId?: string;
  reminder?: Reminder;
}
export type Modal =
  | { kind: 'order'; id?: string; templateId?: string; counterpartyId?: string }
  | { kind: 'task'; id?: string; orderId?: string; date?: string }
  | { kind: 'folder'; id?: string; parentId?: string | null }
  | { kind: 'item'; id?: string; folderId?: string | null }
  | { kind: 'move'; entity: 'folder' | 'item'; id: string }
  | { kind: 'link'; entity: 'order' | 'item'; id: string }
  | { kind: 'search' }
  | { kind: 'profile' }
  | { kind: 'reminders' }
  | { kind: 'schedule'; id: string }
  | { kind: 'counterparty'; id?: string }
  | { kind: 'counterparty-link'; id: string }
  | { kind: 'template'; id?: string; orderId?: string }
  | { kind: 'work'; id?: string }
  | { kind: 'work-detail'; id: string }
  | { kind: 'catalog' }
  | { kind: 'create'; folderId?: string | null };
