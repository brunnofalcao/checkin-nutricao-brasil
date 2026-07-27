// =====================================================================
// PESSOAS · a base compartilhada
//
// Uma pessoa não é uma linha de banco: é o mesmo ser humano aparecendo em
// várias inscrições (congresso, corrida, expositor, visitante). A tabela
// `participants` guarda inscrições; aqui a gente reagrupa por identidade.
//
// A identidade é, em ordem: e-mail → telefone (só dígitos) → nome.
// A tabela `people` do banco existe mas só enxerga quem tem e-mail — por
// isso ela NÃO é usada como fonte aqui (ver ticket BE-09 no diagnóstico).
// =====================================================================
import { supabase } from './supabase.js';

const COLS =
  'id,event_id,name,email,phone,code,lote,checked,checked_at,source,created_at,cert_token,notes,tags';

// Teto de segurança. Se bater, a tela avisa em vez de mentir um número.
export const TETO_BASE = 8000;

// Carrega a base inteira de uma vez. Com poucos milhares de linhas isso é
// mais rápido e MUITO mais tolerante a wi-fi ruim do que buscar a cada tecla.
export async function carregaInscricoes(limite = TETO_BASE) {
  const { data, error } = await supabase
    .from('participants')
    .select(COLS)
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return data ?? [];
}

// Quais eventos têm certificado configurado (para só gerar token onde faz sentido).
export async function eventosComCertificado() {
  const { data, error } = await supabase.from('cert_modulos').select('event_id');
  if (error) return new Set();
  return new Set((data ?? []).map((r) => r.event_id));
}

// Cria uma inscrição. Devolve a linha criada.
// Erro 23505 = índice único (event_id, email, lote) → duplicado de verdade.
export async function criaInscricao(dados) {
  const { data, error } = await supabase
    .from('participants')
    .insert({ source: 'manual', ...dados })
    .select(COLS)
    .single();
  if (error) {
    if (error.code === '23505') {
      const e = new Error('Já existe uma inscrição com esse e-mail neste evento e neste lote.');
      e.duplicado = true;
      throw e;
    }
    throw error;
  }
  return data;
}

// Atualiza uma ou várias inscrições da mesma pessoa de uma vez.
export async function atualizaInscricoes(ids, patch) {
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from('participants')
    .update(patch)
    .in('id', ids)
    .select(COLS);
  if (error) throw error;
  return data ?? [];
}

// Gera os tokens de certificado que faltam no evento (idempotente, só admin).
export async function geraTokensCertificado(eventId) {
  const { data, error } = await supabase.rpc('cert_gera_tokens', { p_event_id: eventId });
  if (error) throw error;
  return data;
}

// ── Identidade e agrupamento ─────────────────────────────────────────────────

export function soDigitos(v) {
  return String(v ?? '').replace(/\D/g, '');
}

// Remove acento e caixa. No balcão ninguém digita "João" com til.
export function dobra(v) {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// Chave de identidade de uma inscrição.
export function chaveDe(p) {
  const em = dobra(p.email);
  if (em) return 'e:' + em;
  const tel = soDigitos(p.phone);
  if (tel.length >= 10) return 't:' + tel.slice(-11);
  return 'n:' + dobra(p.name);
}

// Reagrupa inscrições em pessoas. Mantém a inscrição mais recente como
// referência de contato (nome/telefone/e-mail mais atuais).
export function agrupaPessoas(inscricoes, eventosPorId) {
  const mapa = new Map();
  for (const p of inscricoes) {
    const k = chaveDe(p);
    let pe = mapa.get(k);
    if (!pe) {
      pe = {
        chave: k,
        nome: p.name || '—',
        email: p.email || '',
        phone: p.phone || '',
        inscricoes: [],
        presencas: 0,
        ultima: p.created_at,
        busca: ''
      };
      mapa.set(k, pe);
    }
    pe.inscricoes.push({ ...p, evento: eventosPorId.get(p.event_id) || null });
    if (p.checked) pe.presencas++;
    // A linha mais nova manda no contato.
    if (!pe.ultima || (p.created_at && p.created_at > pe.ultima)) {
      pe.ultima = p.created_at;
      if (p.name) pe.nome = p.name;
    }
    if (!pe.email && p.email) pe.email = p.email;
    if (!pe.phone && p.phone) pe.phone = p.phone;
  }
  for (const pe of mapa.values()) {
    pe.inscricoes.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    pe.eventos = [...new Set(pe.inscricoes.map((i) => i.event_id))];
    pe.busca = dobra(pe.nome) + ' ' + dobra(pe.email) + ' ' + soDigitos(pe.phone) +
      ' ' + pe.inscricoes.map((i) => dobra(i.code)).join(' ');
  }
  return [...mapa.values()].sort((a, b) => String(b.ultima).localeCompare(String(a.ultima)));
}

// Filtra pessoas por texto livre (nome, e-mail, telefone ou código).
export function filtraPessoas(pessoas, termo) {
  const t = dobra(termo);
  if (!t) return pessoas;
  const dig = soDigitos(termo);
  const partes = t.split(/\s+/).filter(Boolean);
  return pessoas.filter((pe) => {
    if (dig.length >= 4 && soDigitos(pe.phone).includes(dig)) return true;
    return partes.every((parte) => pe.busca.includes(parte));
  });
}

// Procura quem já existe parecido com os dados digitados. Usado no cadastro
// manual para não criar a mesma pessoa duas vezes.
export function procuraParecidos(pessoas, { nome, email, phone }, eventId) {
  const em = dobra(email);
  const tel = soDigitos(phone);
  const nm = dobra(nome);
  const achados = [];
  for (const pe of pessoas) {
    let motivo = null;
    if (em && dobra(pe.email) === em) motivo = 'email';
    else if (tel.length >= 10 && soDigitos(pe.phone).slice(-11) === tel.slice(-11)) motivo = 'telefone';
    else if (nm.length >= 6 && dobra(pe.nome) === nm) motivo = 'nome';
    if (!motivo) continue;
    const noEvento = eventId ? pe.inscricoes.some((i) => i.event_id === eventId) : false;
    achados.push({ pessoa: pe, motivo, noEvento });
  }
  // Quem já está no evento aparece primeiro — é o caso que trava o cadastro.
  return achados.sort((a, b) => Number(b.noEvento) - Number(a.noEvento)).slice(0, 4);
}
