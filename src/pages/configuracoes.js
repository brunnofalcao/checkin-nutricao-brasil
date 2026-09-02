// =====================================================================
// CONFIGURAÇÕES
//
// Três coisas que alguém precisa resolver sem chamar dev:
//   1. quem consegue entrar, e com qual acesso;
//   2. de onde os inscritos estão entrando, e se ainda está entrando;
//   3. em quais eventos o certificado exige check-in.
//
// O que não dá para fazer aqui está escrito na tela, com o caminho.
// Tela de configuração que esconde o que não faz é pior que stub.
// =====================================================================
import { h, setContent } from '../core/dom.js';
import { icons } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { supabase } from '../data/supabase.js';
import { getProfile } from '../data/auth.js';
import { listEvents } from '../data/events.js';
import { fmtRelative } from '../core/utils.js';

// A ordem aqui é a ordem do seletor: do acesso maior para o menor, para
// quem promove alguém ver primeiro o que está entregando.
const PAPEIS = {
  admin: {
    rot: 'Administrador',
    pode: 'Abre o painel inteiro: eventos, pessoas, disparos, certificados, configurações.'
  },
  expositores: {
    rot: 'Exposição',
    pode: 'Só a área de Exposição: cria empresas, gera links, administra credenciais, ' +
          'imprime crachás e dá baixa na retirada. Não alcança disparo de mensagem, ' +
          'pessoas nem configurações.'
  },
  operadora: {
    rot: 'Operação',
    pode: 'Usa o app de credenciamento no celular. Não abre este painel.'
  }
};

export async function pageConfiguracoes(view) {
  setContent(view, h('div', { class: 'loading-row' }, h('span', { class: 'loader' })));

  // `reservas` muda quando alguém reserva ou remove: por isso `let`.
  let [eu, perfis, eventos, fontes, reservas] = await Promise.all([
    getProfile(),
    // O .catch(() => []) transformava falha de rede e recusa de permissão
    // em "nenhum acesso cadastrado" — a tela mais perigosa para se olhar e
    // acreditar, porque é onde se confere quem tem acesso ao sistema.
    supabase.from('profiles').select('id, email, display_name, role, created_at')
      .order('created_at')
      .then((r) => { if (r.error) throw r.error; return r.data ?? []; }),
    listEvents(),
    carregaFontes(),
    carregaReservas()
  ]);

  function render() {
    setContent(
      view,
      h('div', { class: 'page-head' },
        h('div', {},
          h('h1', { class: 'page-title' }, 'Configurações'),
          h('div', { class: 'page-sub' },
            'Acessos, de onde vêm os inscritos e a regra do certificado por evento.'))),

      h('h2', { class: 'home-secao', style: { marginTop: '0' } }, 'Quem tem acesso'),
      blocoAcessos(),

      h('h2', { class: 'home-secao' }, 'Minha senha'),
      blocoSenha(),

      h('h2', { class: 'home-secao' }, 'De onde vêm os inscritos'),
      blocoFontes(),

      h('h2', { class: 'home-secao' }, 'Certificado por evento'),
      blocoCertificado()
    );
  }

  // ── 1. Acessos ────────────────────────────────────────────────────────────
  function blocoAcessos() {
    const admins = perfis.filter((p) => p.role === 'admin').length;
    return h('div', {},
      h('div', { class: 'table-card' },
        h('table', { class: 'table' },
          h('thead', {}, h('tr', {},
            h('th', { style: { width: '38%' } }, 'Pessoa'),
            h('th', {}, 'Acesso'),
            h('th', {}, 'Desde'),
            h('th', { style: { width: '150px' } }, ''))),
          h('tbody', {}, ...perfis.map((p) => linhaPerfil(p, admins))))),

      blocoNovoAcesso());
  }

  // Dar acesso a alguém novo são dois passos, e um deles não é aqui: a
  // senha mora no Supabase. O que se resolve nesta tela é o outro lado.
  // Sem a reserva, todo login novo nascia como Operação, que não abre o
  // painel, e alguém tinha que lembrar de promover depois. Entre uma coisa
  // e outra a pessoa entra, lê "Sem acesso" e liga pedindo socorro.
  function blocoNovoAcesso() {
    return h('div', { class: 'cfg-nota' },
      icons.info(),
      h('div', { style: { flex: '1' } },
        h('strong', {}, 'Dar acesso a alguém novo: reserve aqui, crie a senha no Supabase. '),
        'Escreva o e-mail abaixo e escolha o acesso. Depois vá em ',
        h('strong', {}, 'Supabase → Authentication → Users → Add user'),
        ', informe o mesmo e-mail, defina uma senha provisória e deixe ',
        h('strong', {}, '"Auto Confirm User"'),
        ' marcado. No instante em que o login existir, a pessoa já entra com o acesso ' +
        'reservado. Peça para ela trocar a senha no primeiro acesso, em Configurações.',
        formReserva(),
        listaReservas(),
        perfis.length <= 2
          ? h('div', { class: 'cfg-alerta', style: { marginTop: '10px' } },
              `Hoje existem ${perfis.length} contas no sistema. ` +
              'Se mais alguém vai trabalhar no credenciamento, cada pessoa precisa da sua. ' +
              'Senha compartilhada tira a rastreabilidade de quem fez cada check-in.')
          : null));
  }

  function formReserva() {
    const caixa = h('div', {
      style: { display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'flex-end', marginTop: '12px' }
    },
      h('div', { class: 'field', style: { flex: '1 1 180px', margin: '0' } },
        h('label', {}, 'Nome'),
        h('input', { class: 'input', name: 'nome', placeholder: 'Jaqueline Borges' })),
      h('div', { class: 'field', style: { flex: '1 1 220px', margin: '0' } },
        h('label', {}, 'E-mail'),
        h('input', { class: 'input', name: 'email', type: 'email', placeholder: 'pessoa@exemplo.com' })),
      h('div', { class: 'field', style: { flex: '0 1 170px', margin: '0' } },
        h('label', {}, 'Acesso'),
        h('select', { class: 'input', name: 'papel' },
          ...Object.entries(PAPEIS).map(([v, c]) => h('option', { value: v }, c.rot)))),
      h('button', {
        class: 'btn btn-secondary',
        onclick: (e) => guardaReserva(caixa, e.currentTarget)
      }, 'Reservar acesso'));
    return caixa;
  }

  async function guardaReserva(caixa, btn) {
    const v = (n) => caixa.querySelector(`[name="${n}"]`)?.value?.trim() || '';
    const nome = v('nome'), email = v('email').toLowerCase(), papel = v('papel');
    if (!email) { toast.danger('Escreva o e-mail.'); return; }
    btn.disabled = true;
    const { data, error } = await supabase.rpc('acesso_pre_autoriza',
      { p_email: email, p_papel: papel, p_nome: nome || null });
    btn.disabled = false;
    const motivos = {
      email: 'Esse e-mail não parece válido.',
      papel: 'Esse acesso não existe.',
      ja_tem_login: 'Essa pessoa já tem login. Ajuste o acesso dela na tabela acima.'
    };
    if (error || data?.erro) {
      toast.danger(motivos[data?.erro] || 'Não deu: ' + (error?.message || 'erro'));
      return;
    }
    reservas.unshift({ email, papel, nome: nome || null, criado_em: new Date().toISOString() });
    toast.success(
      `${email} está reservado como ${(PAPEIS[papel]?.rot || papel).toLowerCase()}. ` +
        'Agora crie a senha no Supabase, em Authentication → Users.',
      { ms: 9000 }
    );
    render();
  }

  function listaReservas() {
    if (reservasErro) {
      return h('div', { class: 'cfg-alerta', style: { marginTop: '10px' } },
        'Não consegui ler os acessos reservados: ' + reservasErro +
        '. Pode existir reserva que esta tela não está mostrando.');
    }
    if (!reservas.length) return null;
    return h('div', { style: { marginTop: '12px' } },
      h('div', { class: 'cfg-pode' }, 'Reservados, esperando o login ser criado no Supabase:'),
      h('table', { class: 'table' },
        h('tbody', {}, ...reservas.map((r) =>
          h('tr', {},
            h('td', {},
              h('div', { class: 'row-name' }, r.nome || r.email.split('@')[0]),
              h('div', { class: 'row-sub' }, r.email)),
            h('td', {}, h('span', { class: 'status soon' }, PAPEIS[r.papel]?.rot || r.papel)),
            h('td', { style: { textAlign: 'right' } },
              h('button', {
                class: 'btn btn-ghost btn-sm',
                onclick: (e) => tiraReserva(r, e.currentTarget)
              }, 'Remover')))))));
  }

  async function tiraReserva(r, btn) {
    btn.disabled = true;
    const { error } = await supabase.rpc('acesso_pre_autoriza_remove', { p_email: r.email });
    btn.disabled = false;
    if (error) { toast.danger('Não deu: ' + error.message); return; }
    reservas = reservas.filter((x) => x.email !== r.email);
    toast.success('Reserva removida.');
    render();
  }

  // ── 1b. A própria senha ───────────────────────────────────────────────────
  // Quem entra com senha provisória feita por outra pessoa precisa de um
  // lugar para trocar. Sem isso, a senha do começo fica para sempre, e
  // duas pessoas passam a saber a senha de uma.
  function blocoSenha() {
    let caixa;
    caixa = h('div', { class: 'cfg-nota' },
      icons.info(),
      h('div', { style: { flex: '1' } },
        h('strong', {}, 'Trocar a minha senha. '),
        'Vale só para a sua conta (', eu?.email || '', '). ' +
        'Mínimo de 8 caracteres. Você continua conectado depois de trocar.',
        h('div', {
          style: { display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'flex-end', marginTop: '12px' }
        },
          h('div', { class: 'field', style: { flex: '1 1 200px', margin: '0' } },
            h('label', {}, 'Nova senha'),
            h('input', { class: 'input', name: 'senha1', type: 'password', autocomplete: 'new-password' })),
          h('div', { class: 'field', style: { flex: '1 1 200px', margin: '0' } },
            h('label', {}, 'Repita a nova senha'),
            h('input', { class: 'input', name: 'senha2', type: 'password', autocomplete: 'new-password' })),
          h('button', {
            class: 'btn btn-secondary',
            onclick: (e) => trocaSenha(caixa, e.currentTarget)
          }, 'Trocar senha'))));
    return caixa;
  }

  async function trocaSenha(caixa, btn) {
    const v = (n) => caixa.querySelector(`[name="${n}"]`)?.value || '';
    const s1 = v('senha1'), s2 = v('senha2');
    if (s1.length < 8) { toast.danger('A senha precisa ter pelo menos 8 caracteres.'); return; }
    if (s1 !== s2) { toast.danger('As duas senhas não são iguais.'); return; }
    btn.disabled = true;
    const { error } = await supabase.auth.updateUser({ password: s1 });
    btn.disabled = false;
    if (error) { toast.danger('Não deu: ' + error.message); return; }
    caixa.querySelector('[name="senha1"]').value = '';
    caixa.querySelector('[name="senha2"]').value = '';
    toast.success('Senha trocada. Use a nova no próximo login.', { ms: 7000 });
  }

  function linhaPerfil(p, admins) {
    const souEu = p.id === eu?.id;
    const cfg = PAPEIS[p.role] || { rot: p.role || '—', pode: '' };
    const ultimoAdmin = p.role === 'admin' && admins <= 1;
    return h('tr', {},
      h('td', {},
        h('div', { class: 'row-name' },
          p.display_name || p.email?.split('@')[0] || '—',
          souEu ? h('span', { class: 'cfg-voce' }, 'você') : null),
        h('div', { class: 'row-sub' }, p.email || '—')),
      h('td', {},
        h('div', {}, h('span', {
          class: 'status ' + (p.role === 'admin' ? 'soon' : p.role === 'expositores' ? 'live' : 'done')
        }, cfg.rot)),
        h('div', { class: 'cfg-pode' }, cfg.pode)),
      h('td', { class: 'muted' }, fmtRelative(p.created_at)),
      h('td', {},
        souEu || ultimoAdmin
          ? h('span', { class: 'muted cfg-trava' },
              souEu ? 'não dá para mudar o seu' : 'único admin')
          : h('select', {
              class: 'input cfg-sel',
              'aria-label': 'Acesso de ' + (p.email || ''),
              onchange: (e) => mudaPapel(p, e.target.value, e.target)
            },
              ...Object.entries(PAPEIS).map(([v, c]) =>
                h('option', { value: v, selected: v === p.role || null }, c.rot)))));
  }

  async function mudaPapel(p, papel, el) {
    const antes = p.role;
    el.disabled = true;
    const { data, error } = await supabase.rpc('perfil_muda_papel', { p_id: p.id, p_papel: papel });
    el.disabled = false;
    const motivos = {
      papel: 'Esse acesso não existe.',
      nao_existe: 'Esse perfil não existe mais.',
      proprio: 'Você não pode tirar o seu próprio acesso de administrador.',
      ultimo_admin: 'Esse é o único administrador. Promova outra pessoa antes.'
    };
    if (error || data?.erro) {
      el.value = antes;
      toast.danger(motivos[data?.erro] || 'Não deu: ' + (error?.message || 'erro'));
      return;
    }
    p.role = papel;
    // Quem já está com o painel aberto continua vendo o acesso antigo até
    // recarregar. Dizer isso aqui evita a mensagem "não funcionou".
    toast.success(
      `${p.email?.split('@')[0]} agora é ${(PAPEIS[papel]?.rot || papel).toLowerCase()}. ` +
        'Se ela estiver com o painel aberto, peça para recarregar a página.',
      { ms: 7000 }
    );
    render();
  }

  // ── 2. Fontes de inscrição ────────────────────────────────────────────────
  function blocoFontes() {
    return h('div', { class: 'cfg-grid' }, ...fontes.map((f) =>
      h('div', { class: 'cfg-card' },
        h('div', { class: 'cfg-card-topo' },
          h('div', { class: 'cfg-card-nome' }, f.nome),
          f.ok
            ? h('span', { class: 'status live' }, 'recebendo')
            : h('span', { class: 'status done' }, 'sem movimento')),
        h('div', { class: 'cfg-card-num' }, f.total.toLocaleString('pt-BR')),
        h('div', { class: 'cfg-card-sub' }, f.detalhe))));
  }

  // ── 3. Certificado por evento ─────────────────────────────────────────────
  function blocoCertificado() {
    const lista = eventos.filter((e) => e.event_type === 'congress');
    return h('div', {},
      h('div', { class: 'cfg-nota', style: { marginTop: '0', marginBottom: '12px' } },
        icons.award(),
        h('div', {},
          'Com a trava ligada, só emite certificado quem fez check-in no evento. ' +
          'Certificado com carga horária serve para comprovar educação continuada — ' +
          'emitir para quem não foi é risco que não compensa. ',
          h('strong', {}, 'Evento que já aconteceu nasce destravado'),
          ', para não tirar o certificado de quem já tinha direito.')),
      h('div', { class: 'table-card' },
        h('table', { class: 'table' },
          h('thead', {}, h('tr', {},
            h('th', { style: { width: '42%' } }, 'Evento'),
            h('th', {}, 'Situação'),
            h('th', {}, 'Presenças'),
            h('th', { style: { width: '190px' } }, 'Exige check-in'))),
          h('tbody', {}, ...lista.map((e) =>
            h('tr', {},
              h('td', {}, h('div', { class: 'row-name' }, e.city || e.name)),
              h('td', {}, e.status === 'encerrado'
                ? h('span', { class: 'status done' }, 'Encerrado')
                : h('span', { class: 'status soon' }, 'Em aberto')),
              h('td', { class: 'muted' },
                `${(e.total_checkins || 0).toLocaleString('pt-BR')} de ${(e.total_inscritos || 0).toLocaleString('pt-BR')}`),
              h('td', {},
                h('label', { class: 'cfg-switch' },
                  h('input', {
                    type: 'checkbox',
                    checked: e.cert_exige_checkin !== false || null,
                    onchange: (ev) => trocaTrava(e, ev.target)
                  }),
                  h('span', {}, e.cert_exige_checkin !== false ? 'Exige' : 'Livre')))))))));
  }

  async function trocaTrava(e, el) {
    const valor = el.checked;
    el.disabled = true;
    const { error } = await supabase.from('events')
      .update({ cert_exige_checkin: valor }).eq('id', e.id);
    el.disabled = false;
    if (error) {
      el.checked = !valor;
      toast.danger('Não deu: ' + error.message);
      return;
    }
    e.cert_exige_checkin = valor;
    const fora = (e.total_inscritos || 0) - (e.total_checkins || 0);
    toast.success(valor
      ? `${e.city || e.name}: certificado só com check-in` +
        (fora > 0 ? ` — ${fora} inscritos sem presença ficam de fora.` : '.')
      : `${e.city || e.name}: certificado liberado para todos os inscritos.`);
    render();
  }

  render();
}

// Acessos reservados que ainda não viraram login. Erro aqui não pode virar
// "nenhuma reserva": esta é a tela onde se confere quem vai poder entrar.
let reservasErro = null;
async function carregaReservas() {
  const { data, error } = await supabase
    .from('acessos_pre_autorizados')
    .select('email, papel, nome, criado_em')
    .is('usado_em', null)
    .order('criado_em', { ascending: false });
  reservasErro = error ? (error.message || 'erro') : null;
  return data ?? [];
}

// Conta de onde os participantes vieram. Nada aqui é chute: sai da coluna
// source, que cada integração preenche ao gravar.
async function carregaFontes() {
  const nomes = {
    hotmart: 'Hotmart',
    ticketsports: 'TicketSports',
    import: 'Importação de planilha',
    manual: 'Cadastro manual',
    visitante: 'Visitante'
  };
  const { data } = await supabase
    .from('participants')
    .select('source, created_at')
    .order('created_at', { ascending: false })
    .limit(8000);
  const linhas = data ?? [];
  const porFonte = new Map();
  for (const p of linhas) {
    const k = p.source || 'manual';
    const atual = porFonte.get(k) || { total: 0, ultimo: null };
    atual.total++;
    if (!atual.ultimo || p.created_at > atual.ultimo) atual.ultimo = p.created_at;
    porFonte.set(k, atual);
  }
  const agora = Date.now();
  return [...porFonte.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([k, v]) => ({
      nome: nomes[k] || k,
      total: v.total,
      ok: v.ultimo ? agora - new Date(v.ultimo).getTime() < 7 * 86400000 : false,
      detalhe: v.ultimo ? 'última entrada ' + fmtRelative(v.ultimo) : 'nunca'
    }));
}
