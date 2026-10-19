import { it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { initialData, validateBackup } from '../desktop/model.js';
import { createDesign } from '../desktop/design-model.js';
import { LocalStore, restoreBackup } from '../local/store';
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
function fixture() {
  const data = initialData();
  data.platforms = [{ id: 'p', name: '平台', color: '#222222', fee: 0 }];
  data.clients = [
    {
      id: 'c',
      name: '单主',
      platforms: ['p'],
      preferences: '',
      dislikes: '',
      requirements: '',
      notes: '',
      cn: '作者名',
      salutation: '称呼',
      platformLink: 'https://example.com/profile',
    },
  ];
  data.templates = [
    {
      id: 't',
      title: '自定义类别模板',
      platform: 'p',
      category: '自由类别',
      deposit: 0,
      balance: 0,
      fee: 0,
      stages: ['未开始', '草稿', '确认构图', '成图', '完成'],
      requirements: '',
      images: [],
      extras: [],
    },
  ];
  return data;
}
it('accepts duration-free commission templates, custom stages and optional client fields while rejecting unsafe or duplicate values', () => {
  const data = fixture();
  expect(validateBackup(data)).toEqual(data);
  const legacy = structuredClone(data);
  delete legacy.clients[0].cn;
  delete legacy.clients[0].salutation;
  delete legacy.clients[0].platformLink;
  legacy.templates[0].duration = 7;
  expect(() => validateBackup(legacy)).not.toThrow();
  const unsafe = structuredClone(data);
  unsafe.clients[0].platformLink = 'javascript:alert(1)';
  expect(() => validateBackup(unsafe)).toThrow();
  const duplicate = structuredClone(data);
  duplicate.templates[0].stages.splice(2, 0, '草稿');
  expect(() => validateBackup(duplicate)).toThrow();
});
it('persists template fonts, free text, optional card fields, background and image layers as private files through backup and recovery', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lotus-customization-'));
  let store: LocalStore | undefined;
  try {
    const data = fixture();
    const card = createDesign('card');
    card.font = 'kai';
    card.color = '#123456';
    card.backgroundImage = png;
    card.items.push({
      kind: 'image',
      name: '例图',
      src: png,
      x: 800,
      y: 250,
      scale: 50,
      rotation: 20,
      visible: true,
    });
    card.items.push({
      kind: 'text',
      name: '自填文字',
      text: '保留文字\n第二行',
      binding: '',
      x: 350,
      y: 500,
      width: 500,
      size: 28,
      align: 'left',
      rotation: 0,
      visible: true,
    });
    data.toolTemplates = [
      {
        id: 'card',
        kind: 'card',
        name: '自定义会员卡',
        accent: '#ffffff',
        brand: '',
        handle: '',
        message: '',
        subtitle: '',
        cardNumber: '',
        design: card,
      },
      { id: 'layout', kind: 'layout', name: '自定义排版', layout: structuredClone(card) },
    ];
    store = new LocalStore(root);
    store.saveDesktop(data, 0);
    expect(store.loadDesktop().data).toEqual(data);
    const saved = store.loadDesktop().data.toolTemplates[0].design;
    expect(
      saved.items.find(
        (item: { binding?: string; visible?: boolean }) => item.binding === 'cardNumber',
      ).visible,
    ).toBe(false);
    expect(fs.readdirSync(path.join(root, 'data/files'))).toHaveLength(1);
    const db = new DatabaseSync(path.join(root, 'data/workbench.sqlite'), { readOnly: true });
    try {
      for (const row of db.prepare('SELECT payload FROM desktop_records').all())
        expect(String(row.payload)).not.toContain('base64,');
    } finally {
      db.close();
    }
    const backup = store.backup();
    store.close();
    store = undefined;
    restoreBackup(root, backup);
    store = new LocalStore(root);
    expect(store.loadDesktop().data).toEqual(data);
    const invalid = structuredClone(data);
    invalid.toolTemplates[0].design.backgroundImage = 'https://remote.example/image.png';
    expect(() => store!.saveDesktop(invalid, store!.loadDesktop().revision)).toThrow();
    expect(store.loadDesktop().data).toEqual(data);
  } finally {
    store?.close();
    if (
      !path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep + 'lotus-customization-')
    )
      throw new Error('Unsafe test cleanup');
    fs.rmSync(root, { recursive: true, force: true });
  }
});
