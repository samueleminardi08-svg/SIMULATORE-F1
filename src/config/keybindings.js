/**
 * Configurazione completa e persistente dei comandi tastiera personalizzabili.
 * Node.js headless safe (nessuna dipendenza DOM/window al top-level).
 */

export const KEYBINDINGS_STORAGE_KEY = 'f1_game_keybindings_v1';

export const KEYBIND_ACTIONS = [
  {
    id: 'accelerate',
    group: 'driving',
    label: 'Accelera',
    desc: 'Gas / Uscita dai box',
    defaultCode: 'KeyW',
  },
  {
    id: 'brake',
    group: 'driving',
    label: 'Frena / Retro',
    desc: 'Frenata progressiva e retromarcia',
    defaultCode: 'KeyS',
  },
  {
    id: 'steerLeft',
    group: 'driving',
    label: 'Sterza a Sinistra',
    desc: 'Sterzata verso sinistra',
    defaultCode: 'KeyA',
  },
  {
    id: 'steerRight',
    group: 'driving',
    label: 'Sterza a Destra',
    desc: 'Sterzata verso destra',
    defaultCode: 'KeyD',
  },
  {
    id: 'camera',
    group: 'actions',
    label: 'Cambia Visuale',
    desc: 'Alterna Onboard (T-Cam) e Prima Persona',
    defaultCode: 'KeyC',
  },
  {
    id: 'pitRequest',
    group: 'actions',
    label: 'Prenota Pit Stop (BOX)',
    desc: 'Attiva/annulla il rientro ai box',
    defaultCode: 'KeyP',
  },
  {
    id: 'cyclePitCompound',
    group: 'actions',
    label: 'Scegli Mescola Pit Stop',
    desc: 'Scorre S → M → H → W prima della sosta',
    defaultCode: 'KeyT',
  },
  {
    id: 'resetToTrack',
    group: 'actions',
    label: 'Rimetti in Pista',
    desc: 'Riporta la vettura sull’asfalto se sei fuori pista o bloccato',
    defaultCode: 'Backspace',
  },
  {
    id: 'weather',
    group: 'actions',
    label: 'Cambia Meteo Rapido',
    desc: 'Alterna Asciutto / Pioggia / Pioggia Forte',
    defaultCode: 'KeyR',
  },
  {
    id: 'physicsDebug',
    group: 'actions',
    label: 'Diagnosi Fisica',
    desc: 'Mostra/nasconde telemetria avanzata',
    defaultCode: 'F3',
  },
  {
    id: 'pause',
    group: 'actions',
    label: 'Pausa / Menù',
    desc: 'Apre il menù di pausa in pista',
    defaultCode: 'Escape',
  },
];

export const DEFAULT_KEYBINDINGS = Object.freeze({
  accelerate: 'KeyW',
  brake: 'KeyS',
  steerLeft: 'KeyA',
  steerRight: 'KeyD',
  camera: 'KeyC',
  pitRequest: 'KeyP',
  cyclePitCompound: 'KeyT',
  resetToTrack: 'Backspace',
  weather: 'KeyR',
  physicsDebug: 'F3',
  pause: 'Escape',
  allowArrowFallback: true,
});

const ACTION_IDS = KEYBIND_ACTIONS.map((a) => a.id);

const FORBIDDEN_CODES = new Set([
  '',
  'Unidentified',
  'MetaLeft',
  'MetaRight',
  'OSLeft',
  'OSRight',
  'ContextMenu',
  'CapsLock',
  'NumLock',
  'ScrollLock',
  'PrintScreen',
]);

export function isBindableKeyCode(code) {
  return typeof code === 'string' && code.length > 0 && !FORBIDDEN_CODES.has(code);
}

export function normalizeKeybindings(raw = null) {
  const result = { ...DEFAULT_KEYBINDINGS };
  if (raw && typeof raw === 'object') {
    for (const id of ACTION_IDS) {
      if (isBindableKeyCode(raw[id])) {
        result[id] = raw[id];
      }
    }
    if (typeof raw.allowArrowFallback === 'boolean') {
      result.allowArrowFallback = raw.allowArrowFallback;
    }
  }
  return result;
}

export function loadKeybindings() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_KEYBINDINGS };
  }
  try {
    const raw = window.localStorage.getItem(KEYBINDINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_KEYBINDINGS };
    return normalizeKeybindings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_KEYBINDINGS };
  }
}

export function saveKeybindings(bindings) {
  const normalized = normalizeKeybindings(bindings);
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(KEYBINDINGS_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // ignore storage quota errors
    }
  }
  return normalized;
}

export function resetKeybindings() {
  return saveKeybindings(DEFAULT_KEYBINDINGS);
}

/**
 * Assegna `newCode` ad `actionId`. Se un'altra azione usava già quel tasto,
 * esegue uno scambio pulito con il vecchio tasto per evitare conflitti o azioni vuote.
 */
export function rebindActionKey(currentBindings, actionId, newCode) {
  const next = normalizeKeybindings(currentBindings);
  if (!ACTION_IDS.includes(actionId) || !isBindableKeyCode(newCode)) {
    return { bindings: next, swappedWith: null };
  }
  const prevCode = next[actionId];
  if (prevCode === newCode) {
    return { bindings: next, swappedWith: null };
  }

  let swappedWith = null;
  for (const otherId of ACTION_IDS) {
    if (otherId !== actionId && next[otherId] === newCode) {
      next[otherId] = prevCode;
      swappedWith = otherId;
      break;
    }
  }
  next[actionId] = newCode;
  return { bindings: next, swappedWith };
}

const SPECIAL_KEY_LABELS = {
  Space: 'SPAZIO',
  Escape: 'ESC',
  Enter: 'INVIO',
  NumpadEnter: 'INVIO NUM',
  Tab: 'TAB',
  Backspace: 'BACK',
  Delete: 'CANC',
  Insert: 'INS',
  Home: 'HOME',
  End: 'FINE',
  PageUp: 'PG SU',
  PageDown: 'PG GIÙ',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  ShiftLeft: 'SHIFT SX',
  ShiftRight: 'SHIFT DX',
  ControlLeft: 'CTRL SX',
  ControlRight: 'CTRL DX',
  AltLeft: 'ALT',
  AltRight: 'ALT GR',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
  NumpadAdd: 'NUM +',
  NumpadSubtract: 'NUM -',
  NumpadMultiply: 'NUM *',
  NumpadDivide: 'NUM /',
  NumpadDecimal: 'NUM .',
};

export function formatKeyCodeLabel(code) {
  if (!code || typeof code !== 'string') return '—';
  if (SPECIAL_KEY_LABELS[code]) return SPECIAL_KEY_LABELS[code];
  if (code.startsWith('Key') && code.length === 4) return code.slice(3).toUpperCase();
  if (code.startsWith('Digit') && code.length === 6) return code.slice(5);
  if (code.startsWith('Numpad') && code.length === 7) return `NUM ${code.slice(6)}`;
  if (/^F\d{1,2}$/.test(code)) return code;
  return code.toUpperCase();
}
