// Динамический тулбар: меню собираются из вкладов областей.
//
// В каркасе нет ни одного статичного пункта. Область объявляет в registry.js:
//
//   topbarMenus:    [{ id, label, order }]      — категории, которые она знает
//   topbarSections: [{ id, menu, label, order, items }] — свои разделы в категории
//
// Правило сборки (по договорённости):
//   * категорию отметили несколько областей → появляется общее меню («Вид»,
//     «Поза»), а внутри разделы областей разделяются чертой;
//   * категорию отметила одна область → это её собственное меню.
//
// Раздел без `menu` попадает в личное меню области (id = id области). Категория
// без объявления берёт подпись у области-владельца, поэтому отключение движка
// не ломает тулбар: чужие разделы просто уезжают в меню своих областей.
//
// Модуль — чистые данные: ни DOM, ни импортов областей, читается в Node-тестах.

/** kinds пункта, которые понимает исполнитель команд в приложении. */
const ITEM_KEYS = ['action', 'pose', 'view', 'env', 'help'];

function itemError(where, message) {
  return new Error(`Тулбар ${where}: ${message}`);
}

/** Проверка объявления меню области. */
export function validateTopbarMenus(scope) {
  for (const menu of scope.topbarMenus ?? []) {
    if (!menu?.id || !menu.label) throw itemError(scope.id, 'у меню нужны id и label');
  }
  return true;
}

/** Проверка раздела: идентификатор, подпись и корректные пункты. */
export function validateTopbarSections(scope) {
  const seen = new Set();
  for (const section of scope.topbarSections ?? []) {
    const where = `${scope.id}/${section?.id ?? '?'}`;
    if (!section?.id || !section.label) throw itemError(where, 'у раздела нужны id и label');
    if (seen.has(section.id)) throw itemError(where, 'повторяющийся id раздела');
    seen.add(section.id);
    if (!Array.isArray(section.items) || !section.items.length) {
      throw itemError(where, 'нужен непустой список пунктов');
    }
    for (const item of section.items) {
      if (item?.separator) continue;
      if (item?.envItems) continue;
      if (!item?.label) throw itemError(where, 'у пункта нужна подпись');
      const kinds = ITEM_KEYS.filter((key) => item[key]);
      if (kinds.length > 1) throw itemError(where, `пункт «${item.label}» задаёт несколько команд: ${kinds}`);
    }
  }
  return true;
}

const orderOf = (entry, fallback = 1000) => (typeof entry.order === 'number' ? entry.order : fallback);

/**
 * Собирает меню тулбара из областей.
 * @param {Array} scopes области в порядке реестра
 * @returns {Array<{id,label,order,shared:boolean,sections:Array}>}
 */
export function collectTopbarMenus(scopes = []) {
  /** @type {Map<string, {id,label,order,declared:boolean,sections:Array}>} */
  const menus = new Map();

  const ensure = (id, fallback) => {
    if (!menus.has(id)) {
      menus.set(id, {
        id,
        label: fallback.label,
        order: fallback.order,
        declared: Boolean(fallback.declared),
        sections: [],
      });
    }
    return menus.get(id);
  };

  // 1. Объявленные категории — только подписи и порядок, без пунктов.
  for (const scope of scopes) {
    for (const menu of scope.topbarMenus ?? []) {
      const existing = menus.get(menu.id);
      if (existing?.declared) {
        throw itemError(scope.id, `категория «${menu.id}» уже объявлена другой областью`);
      }
      menus.set(menu.id, {
        id: menu.id,
        label: menu.label,
        order: orderOf(menu, orderOf(scope)),
        declared: true,
        sections: existing?.sections ?? [],
      });
    }
  }

  // 2. Разделы областей раскладываются по категориям.
  for (const scope of scopes) {
    for (const section of scope.topbarSections ?? []) {
      const id = section.menu || scope.id;
      // Категория не объявлена — меню становится личным меню области.
      const menu = ensure(id, { label: scope.label, order: orderOf(scope), declared: false });
      if (menu.sections.some((entry) => entry.id === section.id)) {
        throw itemError(scope.id, `раздел «${section.id}» уже добавлен в меню «${id}»`);
      }
      menu.sections.push({
        id: section.id,
        label: section.label,
        owner: scope.id,
        ownerLabel: scope.label,
        order: orderOf(section, orderOf(scope)),
        items: section.items.map((item) => ({ ...item })),
      });
    }
  }

  // 3. Пустые категории в тулбар не попадают.
  const live = [...menus.values()].filter((menu) => menu.sections.length);
  for (const menu of live) {
    menu.sections.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
    menu.shared = new Set(menu.sections.map((section) => section.owner)).size > 1;
    // Порядок личного меню наследует порядок области.
    if (!menu.declared) menu.order = Math.min(...menu.sections.map((section) => section.order));
  }
  return live.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

/**
 * Плоский список для построителя меню каркаса.
 *
 * Между разделами ставится черта, а первый пункт раздела несёт `sectionTitle`:
 * каркас рисует по нему заголовок. Библиотека умеет только пункты и разделители,
 * поэтому заголовки навешиваются после сборки.
 */
export function toMenuSpec(menus = []) {
  return menus.map((menu) => {
    const items = [];
    menu.sections.forEach((section, index) => {
      if (index > 0) {
        items.push({
          separator: true,
          sectionId: section.id,
          sectionOwner: section.owner,
          sectionBoundary: true,
        });
      }
      section.items.forEach((item, position) => {
        const entry = { ...item, sectionId: section.id, sectionOwner: section.owner };
        if (position === 0) entry.sectionTitle = section.label;
        items.push(entry);
      });
    });
    return { id: menu.id, label: menu.label, shared: menu.shared, items };
  });
}

/** Все команды тулбара — для проверки, что исполнитель их знает. */
export function topbarActions(menus = []) {
  const actions = new Set();
  for (const menu of menus) {
    for (const section of menu.sections) {
      for (const item of section.items) if (item.action) actions.add(item.action);
    }
  }
  return [...actions].sort();
}

export default collectTopbarMenus;

/**
 * Меню «Справка» строится из тем, которые принесли области.
 *
 * Пункт на каждую тему открывает диалог сразу на нужной вкладке; сколько
 * областей принесли справку — столько пунктов. Статичных строк нет.
 * @param {Array} topics результат collectHelpTopics
 */
export function helpMenuSpec(topics = [], { order = 900 } = {}) {
  if (!topics.length) return null;
  return {
    id: 'help',
    label: 'Справка',
    order,
    shared: false,
    sections: [{
      id: 'help-topics',
      label: 'Разделы',
      owner: 'help',
      ownerLabel: 'Справка',
      order,
      items: [
        ...topics.map((topic, index) => ({
          label: topic.label,
          help: topic.id,
          kbd: index === 0 ? 'F1' : '',
          sectionId: 'help-topics',
          sectionOwner: 'help',
          ...(index === 0 ? { sectionTitle: 'Разделы' } : {}),
        })),
        { separator: true, sectionId: 'help-topics', sectionOwner: 'help' },
        { label: 'О программе', action: 'about', sectionId: 'help-topics', sectionOwner: 'help' },
      ],
    }],
  };
}
