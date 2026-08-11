// =====================================================================
// PERMISSÕES DO PAINEL — quem enxerga o quê
//
// Até aqui o painel era tudo-ou-nada: ou admin, ou tela de acesso negado.
// Isso obrigava a promover a admin quem só precisava credenciar expositor —
// e admin alcança disparo de WhatsApp para a base inteira, exclusão de
// pessoas e troca de papel dos outros.
//
// Este arquivo é a fonte única da verdade. O menu esconde e o roteador
// bloqueia a partir daqui — esconder sem bloquear é enfeite: basta digitar
// o endereço na barra. E o banco tem a própria trava (pode_expo), porque
// permissão que só existe no navegador não é permissão.
// =====================================================================

// '*' = tudo. Lista = só esses prefixos de rota.
const ACESSO = {
  admin: '*',
  // Credenciamento de expositor de ponta a ponta: cria empresa, gera link,
  // mexe em credenciais, vê equipe, imprime crachá.
  expositores: ['/expositores'],
  // Operadora vive no app de check-in, não no painel.
  operadora: []
};

export const ROTULO_PAPEL = {
  admin: 'Administrador',
  expositores: 'Exposição',
  operadora: 'Operadora (app de check-in)'
};

export const DESCRICAO_PAPEL = {
  admin: 'Acesso total ao painel, inclusive disparo de mensagens, pessoas e configurações.',
  expositores:
    'Só a área de Exposição: cria empresas, gera links, administra credenciais, ' +
    'imprime crachás e dá baixa na retirada. Não alcança disparo, pessoas nem configurações.',
  operadora:
    'Sem acesso ao painel. Usa o app de check-in para credenciar no dia.'
};

export function papelDe(profile) {
  return profile?.role || 'operadora';
}

// A rota casa se for igual ou filha do prefixo permitido. '/expositores'
// libera '/expositores/x'; nunca '/expositoresXPTO'.
export function podeVer(profile, path) {
  const regra = ACESSO[papelDe(profile)] ?? [];
  if (regra === '*') return true;
  return regra.some((p) => path === p || path.startsWith(p + '/'));
}

export function temPainel(profile) {
  const regra = ACESSO[papelDe(profile)] ?? [];
  return regra === '*' || regra.length > 0;
}

// Para onde mandar quem entra: a primeira rota que a pessoa pode ver.
export function rotaInicial(profile) {
  const regra = ACESSO[papelDe(profile)] ?? [];
  return regra === '*' ? '/' : regra[0] || '/';
}
