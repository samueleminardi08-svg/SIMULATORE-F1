/**
 * Gestore unico delle finestre modali / pop-up centrati sullo schermo (Step 3).
 * Garantisce centramento viewport con backdrop blur, chiusura unificata (✕, sfondo, Esc)
 * e navigazione da tastiera interna (←/→, ↑/↓, Invio) senza duplicare eventi Esc con il GameLoop.
 */

const CHOICE_CYCLE_SELECTOR = '.menu-choice-btn:not([disabled])';

const isElement = (el) => typeof Element !== 'undefined' && el instanceof Element;
const isHtmlEl = (el) => typeof HTMLElement !== 'undefined' && el instanceof HTMLElement;
const isHtmlBtn = (el) =>
  typeof HTMLButtonElement !== 'undefined' && el instanceof HTMLButtonElement;

export class ModalManager {
  constructor(targetWindow = typeof window !== 'undefined' ? window : null) {
    /** @type {Map<string, { id: string, element: HTMLElement, dialogEl: HTMLElement | null, onClose: Function | null, onConfirm: Function | null, closeOnBackdrop: boolean, isOpen: boolean, previousFocus: Element | null }>} */
    this._modals = new Map();
    /** @type {string[]} */
    this._activeOrder = [];
    this._targetWindow = targetWindow;

    this._onKeyDown = (event) => this._handleKeyDown(event);
    if (this._targetWindow) {
      this._targetWindow.addEventListener('keydown', this._onKeyDown);
    }
  }

  /**
   * Registra una modale (.f1-modal-backdrop) nel sistema unico.
   * @param {string} id
   * @param {{ element?: HTMLElement | null, onClose?: Function | null, onConfirm?: Function | null, closeOnBackdrop?: boolean }} [options]
   */
  register(id, options = {}) {
    const element =
      options.element || (typeof document !== 'undefined' ? document.getElementById(id) : null);
    if (!element) return null;

    if (this._modals.has(id)) {
      const existing = this._modals.get(id);
      if (options.onClose !== undefined) existing.onClose = options.onClose;
      if (options.onConfirm !== undefined) existing.onConfirm = options.onConfirm;
      if (options.closeOnBackdrop !== undefined) {
        existing.closeOnBackdrop = Boolean(options.closeOnBackdrop);
      }
      return existing;
    }

    const dialogEl = element.querySelector('.f1-modal-dialog');
    const entry = {
      id,
      element,
      dialogEl,
      onClose: options.onClose || null,
      onConfirm: options.onConfirm || null,
      closeOnBackdrop: options.closeOnBackdrop !== false,
      isOpen: false,
      previousFocus: null,
    };

    element.addEventListener('click', (event) => {
      const target = event.target;
      if (target === element && entry.closeOnBackdrop) {
        this.close(id, 'backdrop');
        return;
      }
      if (isElement(target) && target.closest('[data-modal-close]')) {
        this.close(id, 'close-button');
      }
    });

    this._modals.set(id, entry);
    return entry;
  }

  isOpen(id) {
    return Boolean(this._modals.get(id)?.isOpen);
  }

  hasOpenModal() {
    return this._activeOrder.length > 0;
  }

  getActiveModalId() {
    if (this._activeOrder.length === 0) return null;
    return this._activeOrder[this._activeOrder.length - 1];
  }

  open(id) {
    const entry = this._modals.get(id);
    if (!entry) return false;

    const alreadyOpen = entry.isOpen;
    if (!alreadyOpen) {
      entry.previousFocus =
        typeof document !== 'undefined' ? document.activeElement : null;
      entry.isOpen = true;
    }

    this._activeOrder = this._activeOrder.filter((itemId) => itemId !== id);
    this._activeOrder.push(id);

    entry.element.style.display = 'flex';
    entry.element.classList.add('is-modal-open');
    entry.element.setAttribute('aria-hidden', 'false');

    if (!alreadyOpen) {
      this._focusFirstControl(entry);
    }
    return true;
  }

  close(id, reason = 'programmatic') {
    const entry = this._modals.get(id);
    if (!entry) return false;

    const wasOpen = entry.isOpen || entry.element.style.display !== 'none';
    entry.isOpen = false;
    this._activeOrder = this._activeOrder.filter((itemId) => itemId !== id);

    if (
      typeof document !== 'undefined' &&
      isHtmlEl(document.activeElement) &&
      typeof entry.element.contains === 'function' &&
      entry.element.contains(document.activeElement)
    ) {
      document.activeElement.blur();
    }

    entry.element.style.display = 'none';
    entry.element.classList.remove('is-modal-open');
    entry.element.setAttribute('aria-hidden', 'true');

    if (wasOpen && reason !== 'sync' && entry.onClose) {
      entry.onClose(reason, id);
    }

    if (wasOpen && isHtmlEl(entry.previousFocus) && this._activeOrder.length === 0) {
      if (
        typeof document !== 'undefined' &&
        document.body.contains(entry.previousFocus) &&
        entry.previousFocus.offsetParent !== null
      ) {
        entry.previousFocus.focus({ preventScroll: true });
      }
    }
    entry.previousFocus = null;
    return wasOpen;
  }

  /**
   * Sincronizza la visibilità di una modale con lo stato applicativo senza rilanciare onClose.
   */
  syncVisibility(id, visible) {
    if (visible) {
      if (!this.isOpen(id)) {
        this.open(id);
      } else {
        const entry = this._modals.get(id);
        if (entry) entry.element.style.display = 'flex';
      }
    } else if (this.isOpen(id)) {
      this.close(id, 'sync');
    } else {
      const entry = this._modals.get(id);
      if (entry && entry.element.style.display !== 'none') {
        entry.element.style.display = 'none';
        entry.element.classList.remove('is-modal-open');
        entry.element.setAttribute('aria-hidden', 'true');
      }
    }
  }

  /**
   * Gestisce il tasto Esc delegato dal controller principale; ritorna true se ha chiuso una modale.
   */
  handleEscape() {
    const activeId = this.getActiveModalId();
    if (!activeId) return false;
    this.close(activeId, 'escape');
    return true;
  }

  _focusFirstControl(entry) {
    const root = entry.dialogEl || entry.element;
    if (!root || typeof document === 'undefined') return;
    if (root.contains(document.activeElement) && document.activeElement !== document.body) {
      return;
    }

    const selectorPriority = [
      '[data-modal-autofocus]',
      '.menu-choice-btn.is-selected:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      '[data-modal-primary]:not([disabled])',
      'button:not([disabled]):not([data-modal-close])',
    ];
    for (const selector of selectorPriority) {
      const candidates = root.querySelectorAll(selector);
      for (const el of candidates) {
        if (isHtmlEl(el) && el.offsetParent !== null) {
          el.focus({ preventScroll: true });
          return;
        }
      }
    }
    const closeBtn = root.querySelector('[data-modal-close]');
    if (isHtmlEl(closeBtn)) {
      closeBtn.focus({ preventScroll: true });
    }
  }

  _getVisibleStopList(root) {
    const all = [
      ...root.querySelectorAll(
        'button:not([disabled]):not([data-modal-close]), input:not([disabled]), select:not([disabled])'
      ),
    ].filter((el) => isHtmlEl(el) && el.offsetParent !== null);

    // Mantiene un solo rappresentante per ciascun .menu-btn-group così ↑/↓ cambia gruppo rapidamente
    const seenGroups = new Set();
    const stops = [];
    for (const el of all) {
      const group = el.closest('.menu-btn-group');
      if (group && el.matches('.menu-choice-btn')) {
        if (seenGroups.has(group)) continue;
        seenGroups.add(group);
        const preferred =
          group.querySelector('.menu-choice-btn.is-selected:not([disabled])') || el;
        stops.push(preferred);
        continue;
      }
      stops.push(el);
    }
    return stops;
  }

  _handleKeyDown(event) {
    const activeId = this.getActiveModalId();
    if (!activeId) return;
    const entry = this._modals.get(activeId);
    if (!entry) return;

    const root = entry.dialogEl || entry.element;
    const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
    const tag = activeEl?.tagName;

    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      if (event.code === 'Enter') {
        if (activeEl.id === 'mp-join-code-input') {
          event.preventDefault();
          root.querySelector('#mp-join-room-btn')?.click();
        } else if (activeEl.id === 'career-player-name') {
          event.preventDefault();
          const primaryBtn = root.querySelector('[data-modal-primary]:not([disabled])');
          if (isHtmlEl(primaryBtn)) {
            primaryBtn.click();
          } else {
            this.close(activeId, 'confirm');
          }
        }
      }
      return;
    }

    if (tag === 'SELECT') {
      return;
    }

    if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
      const delta = event.code === 'ArrowRight' ? 1 : -1;
      const focusedGroup = isElement(activeEl)
        ? activeEl.closest('.menu-btn-group, .finish-actions, .f1-modal-footer')
        : null;
      const targetGroup =
        focusedGroup ||
        root.querySelector('.menu-btn-group') ||
        root.querySelector('.finish-actions, .f1-modal-footer');
      if (!targetGroup) return;

      const btns = [...targetGroup.querySelectorAll('button:not([disabled])')].filter(
        (b) => isHtmlEl(b) && b.offsetParent !== null
      );
      if (btns.length === 0) return;

      event.preventDefault();
      let curIdx = btns.indexOf(activeEl);
      if (curIdx < 0) {
        curIdx = Math.max(0, btns.findIndex((b) => b.classList.contains('is-selected')));
      }
      const nextBtn = btns[(curIdx + delta + btns.length) % btns.length];
      nextBtn.focus({ preventScroll: true });
      if (nextBtn.matches(CHOICE_CYCLE_SELECTOR)) {
        nextBtn.click();
      }
      return;
    }

    if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
      const delta = event.code === 'ArrowDown' ? 1 : -1;
      const tableWrap = root.querySelector('.finish-table-wrap');
      if (
        tableWrap &&
        tableWrap.scrollHeight > tableWrap.clientHeight + 4 &&
        (!activeEl || !activeEl.closest('.menu-btn-group, input, select'))
      ) {
        event.preventDefault();
        tableWrap.scrollTop += delta * 56;
        return;
      }

      const stops = this._getVisibleStopList(root);
      if (stops.length === 0) return;
      event.preventDefault();
      let idx = stops.indexOf(activeEl);
      if (idx < 0 && isElement(activeEl)) {
        const activeGroup = activeEl.closest('.menu-btn-group');
        if (activeGroup) {
          idx = stops.findIndex((s) => s.closest('.menu-btn-group') === activeGroup);
        }
      }
      const nextIdx = idx < 0 ? 0 : (idx + delta + stops.length) % stops.length;
      stops[nextIdx].focus({ preventScroll: true });
      return;
    }

    if (event.code === 'Enter') {
      if (isHtmlBtn(activeEl) && root.contains(activeEl)) {
        return;
      }
      const primaryBtn = root.querySelector('[data-modal-primary]:not([disabled])');
      if (isHtmlEl(primaryBtn) && primaryBtn.offsetParent !== null) {
        event.preventDefault();
        primaryBtn.click();
      } else if (entry.onConfirm) {
        event.preventDefault();
        entry.onConfirm();
      }
    }
  }

  dispose() {
    if (this._targetWindow) {
      this._targetWindow.removeEventListener('keydown', this._onKeyDown);
    }
    this._modals.clear();
    this._activeOrder = [];
  }
}
