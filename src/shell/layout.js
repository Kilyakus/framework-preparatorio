/**
 * Раскладка дока: высоты раскрытых вкладок и компактный режим.
 *
 * Возможности предоставляет `uix-preparatorio`; каркас задаёт значения по
 * умолчанию (ключ хранения, имена событий), чтобы приложение и библиотека
 * использовали одни и те же соглашения.
 */
import { installVirtualDockSizing as installFromLibrary } from "uix-preparatorio/virtual-layout";

export { installCompactDockSizing } from "uix-preparatorio/compact-layout";

/**
 * @param {object} dock док Lumino
 * @param {object} widgets реестр виджетов по id
 * @param {object} [options] переопределения: `storageKey`, `collapseEvent`,
 *   `resetEvent`, `legacyHeight`
 */
export function installVirtualDockSizing(dock, widgets, options = {}) {
  return installFromLibrary(dock, widgets, {
    storageKey: "preparatorio.shell.expanded-tab-heights.v1",
    collapseEvent: "ui:collapse-changed",
    resetEvent: "ui:layout-reset",
    ...options,
  });
}
