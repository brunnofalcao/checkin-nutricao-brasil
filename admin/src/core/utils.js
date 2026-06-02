// Debounce — atrasa execução até ms sem nova chamada.
export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// Throttle — limita execução a 1x a cada ms.
export function throttle(fn, ms = 100) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn(...args);
    }
  };
}

// Formata data ISO em dd/mm/yyyy.
export function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR');
}

// Formata data + hora.
export function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return (
    d.toLocaleDateString('pt-BR') +
    ' · ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  );
}

// "há X tempo" relativo.
export function fmtRelative(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d}d`;
  return fmtDate(iso);
}

// Normaliza telefone para E.164 (formato WhatsApp).
export function normalizePhone(raw) {
  if (!raw) return '';
  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  // Se já começa com 55 e tem 12+ dígitos, mantém.
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  // Brasil sem DDI: adiciona 55.
  if (digits.length === 10 || digits.length === 11) return '55' + digits;
  return digits;
}

// Capitaliza primeira letra.
export function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Primeiro nome.
export function firstName(s) {
  if (!s) return '';
  return s.trim().split(/\s+/)[0];
}
