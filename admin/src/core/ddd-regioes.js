// src/core/ddd-regioes.js
// DDD brasileiro → UF → Região. Usado pelo filtro de Disparos.

const DDD_UF = {
  '68':'AC','96':'AP','92':'AM','97':'AM','91':'PA','93':'PA','94':'PA','69':'RO','95':'RR','63':'TO',
  '82':'AL','71':'BA','73':'BA','74':'BA','75':'BA','77':'BA','85':'CE','88':'CE','98':'MA','99':'MA',
  '83':'PB','81':'PE','87':'PE','86':'PI','89':'PI','84':'RN','79':'SE',
  '61':'DF','62':'GO','64':'GO','65':'MT','66':'MT','67':'MS',
  '27':'ES','28':'ES','31':'MG','32':'MG','33':'MG','34':'MG','35':'MG','37':'MG','38':'MG',
  '21':'RJ','22':'RJ','24':'RJ','11':'SP','12':'SP','13':'SP','14':'SP','15':'SP','16':'SP','17':'SP','18':'SP','19':'SP',
  '41':'PR','42':'PR','43':'PR','44':'PR','45':'PR','46':'PR','51':'RS','53':'RS','54':'RS','55':'RS','47':'SC','48':'SC','49':'SC'
};

const UF_REGIAO = {
  AC:'Norte',AP:'Norte',AM:'Norte',PA:'Norte',RO:'Norte',RR:'Norte',TO:'Norte',
  AL:'Nordeste',BA:'Nordeste',CE:'Nordeste',MA:'Nordeste',PB:'Nordeste',PE:'Nordeste',PI:'Nordeste',RN:'Nordeste',SE:'Nordeste',
  DF:'Centro-Oeste',GO:'Centro-Oeste',MT:'Centro-Oeste',MS:'Centro-Oeste',
  ES:'Sudeste',MG:'Sudeste',RJ:'Sudeste',SP:'Sudeste',
  PR:'Sul',RS:'Sul',SC:'Sul'
};

export const REGIOES = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'];

export function dddFromPhone(raw) {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length === 10 || d.length === 11) return d.slice(0, 2);
  return null;
}

export function regiaoFromPhone(raw) {
  const ddd = dddFromPhone(raw);
  if (!ddd) return null;
  const uf = DDD_UF[ddd];
  return uf ? UF_REGIAO[uf] : null;
}
