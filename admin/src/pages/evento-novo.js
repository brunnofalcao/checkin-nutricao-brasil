// =====================================================================
// NOVO EVENTO
//
// Duas coisas diferentes moram na mesma tabela e por isso o formulário
// pergunta o tipo antes de qualquer outra coisa:
//
//   · Congresso  → evento de verdade, com cidade, local e data próprios.
//   · Público    → corrida, exposição ou visitantes. Não é um evento
//                  novo, é outra porta do mesmo evento. Herda cidade,
//                  local e data do congresso pai e entra no contador.
//
// Confundir os dois foi o que fez o Início anunciar "Expositores –
// Brasília, 0 inscritos" como próximo evento do calendário.
// =====================================================================
import { h, setContent } from '../core/dom.js';
import { openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { supabase } from '../data/supabase.js';

const TIPOS = [
  { v: 'congress', rot: 'Congresso', sub: 'Entra no calendário como evento próprio' },
  { v: 'race', rot: 'Corrida', sub: 'Público de um congresso' },
  { v: 'exhibitor', rot: 'Exposição', sub: 'Público de um congresso' },
  { v: 'visitor', rot: 'Visitantes', sub: 'Público de um congresso' }
];

const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

const PREFIXO = { race: 'NB Run', exhibitor: 'Expositores', visitor: 'Visitantes' };

// "Nutrição Brasil – Belém" + 2026 → nutricao-brasil-belem-2026
export function fazSlug(nome, ano) {
  const base = String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const s = base || 'evento';
  // Nome que já termina em ano não ganha outro: "NB Run 2027" não pode
  // virar "nb-run-2027-2026" por causa do ano do congresso pai.
  if (/-\d{4}$/.test(s)) return s;
  return ano ? `${s}-${ano}` : s;
}

// abreNovoEvento({ eventos, aoCriar })
export function abreNovoEvento({ eventos = [], aoCriar } = {}) {
  const congressos = eventos.filter((e) => !e.parent_event_id && e.event_type === 'congress');
  const f = {
    event_type: 'congress',
    parent_event_id: congressos[0]?.id || '',
    name: '',
    city: '',
    state: '',
    venue: '',
    event_date: '',
    event_end_date: '',
    event_time: '09:00',
    status: 'embreve',
    slug: ''
  };
  let slugTocado = false;
  let corpo;
  let salvando = false;

  const ehPublico = () => f.event_type !== 'congress';
  const pai = () => congressos.find((e) => e.id === f.parent_event_id) || null;

  // Público herda o que é do evento físico. Só o nome fica próprio.
  function herda() {
    const p = pai();
    if (!p) return;
    f.city = p.city || '';
    f.state = p.state || '';
    f.venue = p.venue || p.location || '';
    f.event_date = (p.event_date || p.date_start || '').slice(0, 10);
    f.event_end_date = (p.event_end_date || '').slice(0, 10);
    const cidade = String(p.name || '').split('–').pop().trim() || p.city || '';
    f.name = f.event_type === 'race' ? `${PREFIXO.race} ${anoDe()}` : `${PREFIXO[f.event_type]} – ${cidade}`;
  }

  function anoDe() {
    const d = f.event_date || pai()?.event_date || '';
    return d ? Number(String(d).slice(0, 4)) : new Date().getFullYear();
  }

  function slugAtual() {
    return slugTocado && f.slug ? fazSlug(f.slug, null) : fazSlug(f.name, anoDe());
  }

  function desenha() {
    if (!corpo) return;
    const p = pai();
    setContent(
      corpo,

      h('div', { class: 'cr-rot' }, 'O que você está criando'),
      h('div', { class: 'cr-grid' }, ...TIPOS.map((t) =>
        h('button', {
          type: 'button',
          class: 'cr-opt' + (f.event_type === t.v ? ' on' : ''),
          'aria-pressed': f.event_type === t.v ? 'true' : 'false',
          onclick: () => {
            f.event_type = t.v;
            slugTocado = false;
            if (ehPublico()) herda();
            else { f.name = ''; f.city = ''; f.state = ''; f.venue = ''; f.event_date = ''; f.event_end_date = ''; }
            desenha();
          }
        }, h('div', { class: 'cr-opt-tit' }, t.rot), h('div', { class: 'cr-opt-sub' }, t.sub)))),

      ehPublico() && !congressos.length
        ? h('div', { class: 'pn-alerta trava', style: { marginTop: '16px' } },
            h('div', {},
              h('div', { class: 'pn-alerta-titulo' }, 'Não existe congresso para pendurar isso'),
              h('div', { class: 'pn-alerta-texto' },
                'Corrida, exposição e visitantes são públicos de um congresso. Crie o congresso primeiro.')))
        : null,

      ehPublico() && congressos.length
        ? h('div', { class: 'field', style: { marginTop: '18px' } },
            h('label', { for: 'ev-pai' }, 'De qual congresso'),
            h('select', {
              id: 'ev-pai', class: 'input',
              onchange: (e) => { f.parent_event_id = e.target.value; herda(); desenha(); }
            }, ...congressos.map((e) =>
              h('option', { value: e.id, selected: e.id === f.parent_event_id || null },
                `${e.name}${e.event_date ? ' · ' + e.event_date.slice(0, 10).split('-').reverse().join('/') : ''}`))),
            h('div', { class: 'pn-dica' },
              'Cidade, local e data vêm daqui. É a mesma porta física, com outro público.'))
        : null,

      h('div', { class: 'field', style: { marginTop: '18px' } },
        h('label', { for: 'ev-nome' }, 'Nome do evento'),
        h('input', {
          id: 'ev-nome', class: 'input', type: 'text', autocomplete: 'off',
          placeholder: f.event_type === 'congress' ? 'Nutrição Brasil – Belém' : 'Visitantes – Belém',
          value: f.name,
          oninput: (e) => { f.name = e.target.value; atualizaSlug(); }
        }),
        h('div', { class: 'pn-dica' },
          f.event_type === 'congress'
            ? 'É o que aparece no calendário, no crachá e no certificado.'
            : 'Nome interno. O participante enxerga o nome do congresso, não este.')),

      h('div', { class: 'pn-linha' },
        h('div', { class: 'field' },
          h('label', { for: 'ev-cidade' }, 'Cidade'),
          h('input', {
            id: 'ev-cidade', class: 'input', type: 'text', value: f.city,
            disabled: ehPublico() || null,
            oninput: (e) => { f.city = e.target.value; }
          })),
        h('div', { class: 'field' },
          h('label', { for: 'ev-uf' }, 'UF'),
          h('select', {
            id: 'ev-uf', class: 'input', disabled: ehPublico() || null,
            onchange: (e) => { f.state = e.target.value; }
          }, h('option', { value: '' }, '—'),
             ...UFS.map((u) => h('option', { value: u, selected: u === f.state || null }, u))))),

      h('div', { class: 'field' },
        h('label', { for: 'ev-local' }, 'Local'),
        h('input', {
          id: 'ev-local', class: 'input', type: 'text', value: f.venue,
          placeholder: 'Centro de Convenções, hotel, auditório…',
          disabled: ehPublico() || null,
          oninput: (e) => { f.venue = e.target.value; }
        })),

      h('div', { class: 'pn-linha' },
        h('div', { class: 'field' },
          h('label', { for: 'ev-ini' }, 'Começa em'),
          h('input', {
            id: 'ev-ini', class: 'input', type: 'date', value: f.event_date,
            disabled: ehPublico() || null,
            oninput: (e) => { f.event_date = e.target.value; atualizaSlug(); }
          })),
        h('div', { class: 'field' },
          h('label', { for: 'ev-fim' }, 'Termina em'),
          h('input', {
            id: 'ev-fim', class: 'input', type: 'date', value: f.event_end_date,
            disabled: ehPublico() || null,
            oninput: (e) => { f.event_end_date = e.target.value; }
          }))),

      h('div', { class: 'pn-linha' },
        h('div', { class: 'field' },
          h('label', { for: 'ev-hora' }, 'Horário'),
          h('input', {
            id: 'ev-hora', class: 'input', type: 'time', value: f.event_time,
            oninput: (e) => { f.event_time = e.target.value; }
          })),
        h('div', { class: 'field' },
          h('label', { for: 'ev-status' }, 'Situação'),
          h('select', {
            id: 'ev-status', class: 'input',
            onchange: (e) => { f.status = e.target.value; }
          },
            h('option', { value: 'embreve', selected: f.status === 'embreve' || null }, 'Em breve'),
            h('option', { value: 'ativo', selected: f.status === 'ativo' || null }, 'Em andamento — já aceita check-in'),
            h('option', { value: 'encerrado', selected: f.status === 'encerrado' || null }, 'Encerrado')))),

      h('div', { class: 'field' },
        h('label', { for: 'ev-slug' }, 'Endereço interno (slug)'),
        h('input', {
          id: 'ev-slug', class: 'input mono', type: 'text', value: slugAtual(),
          oninput: (e) => { slugTocado = true; f.slug = e.target.value; }
        }),
        h('div', { class: 'pn-dica' },
          'Usado pela integração do Hotmart e pelos links. Sai do nome sozinho; ' +
          'só mexa se precisar bater com algo que já existe.')),

      p && ehPublico()
        ? h('div', { class: 'cr-resumo' },
            `Vai entrar como público de ${p.name}, somando no contador oficial junto com o congresso.`)
        : null
    );
  }

  function atualizaSlug() {
    const el = document.getElementById('ev-slug');
    if (el && !slugTocado) el.value = slugAtual();
  }

  openModal({
    title: 'Novo evento',
    body: () => {
      const wrap = h('div', { class: 'evento-novo' });
      corpo = h('div', {});
      wrap.appendChild(corpo);
      desenha();
      requestAnimationFrame(() => document.getElementById('ev-nome')?.focus());
      return wrap;
    },
    actions: [
      { label: 'Cancelar', kind: 'btn-ghost', onClick: (fechar) => fechar() },
      {
        label: 'Criar evento',
        kind: 'btn-primary',
        onClick: async (fechar) => {
          if (salvando) return;
          const nome = f.name.trim().replace(/\s+/g, ' ');
          if (nome.length < 3) return toast.danger('Dê um nome ao evento.');
          if (ehPublico() && !f.parent_event_id) return toast.danger('Escolha o congresso.');
          if (!f.city.trim()) return toast.danger('Falta a cidade.');
          if (!f.event_date) return toast.danger('Falta a data de início.');
          if (f.event_end_date && f.event_end_date < f.event_date) {
            return toast.danger('A data de término é anterior à de início.');
          }

          const slug = slugAtual();
          if (!slug) return toast.danger('O slug ficou vazio.');

          salvando = true;
          try {
            const { data: existe } = await supabase
              .from('events').select('id, name').eq('slug', slug).maybeSingle();
            if (existe) {
              salvando = false;
              return toast.danger(`O slug "${slug}" já é de "${existe.name}". Mude o slug.`);
            }

            const novo = {
              slug,
              name: nome,
              city: f.city.trim(),
              state: f.state || null,
              venue: f.venue.trim() || null,
              event_date: f.event_date,
              event_end_date: f.event_end_date || null,
              event_time: f.event_time || '09:00',
              status: f.status,
              event_type: f.event_type,
              parent_event_id: ehPublico() ? f.parent_event_id : null,
              // date_start alimenta a ordenação do calendário e do Início.
              date_start: ehPublico() ? null : new Date(`${f.event_date}T12:00:00Z`).toISOString()
            };

            const { data, error } = await supabase
              .from('events').insert(novo).select().single();
            if (error) throw error;

            toast.success(`${nome} criado.`);
            fechar();
            aoCriar?.(data);
          } catch (e) {
            toast.danger('Não deu para criar: ' + (e.message || e));
          } finally {
            salvando = false;
          }
        }
      }
    ]
  });
}
