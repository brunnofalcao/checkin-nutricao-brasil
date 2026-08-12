// =====================================================================
// ESTADOS DE TELA — erro, vazio e sem permissão
//
// Existiam três jeitos de falhar no painel, e dois deles mentiam:
//
//   1. mostrar o spinner, avisar num toast de 3,5s e sair sem tirar o
//      spinner. Para quem olha, o sistema travou.
//   2. juntar "deu erro" com "não tem nada" no mesmo if. A pessoa lê
//      "Nenhum evento cadastrado" quando o que houve foi a rede cair —
//      e liga achando que o sistema apagou os dados.
//
// O jeito certo já existia em pessoas.js e kb.js: título, causa real e
// botão de tentar de novo. Este arquivo é aquele padrão, num lugar só,
// para não depender de alguém lembrar de copiar.
//
// Erro de rede NUNCA deve ser desenhado como estado vazio. É a regra que
// vale para o painel inteiro.
// =====================================================================
import { h, setContent } from '../core/dom.js';
import { icons } from './icons.js';
import { marcaFalhaDeRede } from './conexao.js';

// A mensagem crua do Supabase não ajuda quem está no balcão às 8h com
// fila. Traduz o que é comum e mantém o resto como está — inventar texto
// bonito para erro desconhecido esconde a informação de quem pode ajudar.
export function motivoLegivel(e) {
  const m = String(e?.message || e || '').trim();
  if (!m) return 'Não deu para saber o motivo.';
  if (/Failed to fetch|NetworkError|ERR_INTERNET|ERR_NETWORK/i.test(m)) {
    return 'A internet caiu no meio do caminho.';
  }
  if (/JWT|token|expired|401/i.test(m)) {
    return 'Sua sessão expirou. Saia e entre de novo.';
  }
  if (/permission denied|row-level security|42501/i.test(m)) {
    return 'Seu acesso não alcança esta informação.';
  }
  if (/timeout|timed out|504/i.test(m)) return 'O servidor demorou demais para responder.';
  return m;
}

// `tentar` é obrigatório de propósito: tela de erro sem saída é beco.
export function telaDeErro(view, erro, tentar, titulo) {
  console.error(erro);
  // Uma tela dizendo "a internet caiu" é um fato isolado; a barra do topo
  // junta os fatos e conta que o problema é a conexão, não o sistema.
  marcaFalhaDeRede(erro);
  setContent(view,
    h('div', { class: 'empty' },
      h('div', { class: 'empty-icon' }, icons.alert ? icons.alert() : '!'),
      h('div', { class: 'empty-title' }, titulo || 'Não consegui carregar'),
      h('div', { class: 'empty-body' }, motivoLegivel(erro)),
      h('button', { class: 'btn btn-primary', onclick: () => tentar() }, 'Tentar de novo')));
}

// Vazio de verdade: a consulta funcionou e não voltou nada.
export function telaVazia(view, titulo, corpo, acao) {
  setContent(view,
    h('div', { class: 'empty' },
      h('div', { class: 'empty-title' }, titulo),
      corpo ? h('div', { class: 'empty-body' }, corpo) : null,
      acao ? h('button', { class: 'btn btn-primary', onclick: acao.onClick }, acao.label) : null));
}

// Quem digita uma rota que o papel dela não alcança hoje cai num 404
// genérico e conclui que a página sumiu. Dizer a verdade evita o chamado.
export function telaSemPermissao(view, perfil) {
  setContent(view,
    h('div', { class: 'empty' },
      h('div', { class: 'empty-title' }, 'Você não tem acesso a esta área'),
      h('div', { class: 'empty-body' },
        `Sua conta${perfil?.email ? ' (' + perfil.email + ')' : ''} não alcança esta parte do painel. ` +
        'Se precisar dela para trabalhar, fale com o administrador.')));
}
