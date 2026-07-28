# /kb.json — o arquivo de dados do site

**Para:** quem cuida do nutricaobrasil.com.br
**Por quê:** a Kcal (assistente de WhatsApp) responde a partir de uma base de
fatos que hoje é preenchida lendo o HTML das páginas. Funciona, mas é
interpretação. Com este arquivo, ela passa a ler o dado exato.

O trabalho de vocês não muda: publicou a página, publica o arquivo junto — de
preferência gerado da mesma fonte que já alimenta a página, para nunca
divergirem.

---

## O endereço

```
GET https://www.nutricaobrasil.com.br/kb.json
Content-Type: application/json; charset=utf-8
```

Público, sem autenticação, sem CORS restrito. É o mesmo conteúdo que já está
visível no site — só que em formato de dados.

---

## Por que isso resolve problemas reais

Três coisas que hoje eu tenho que adivinhar e passaria a ler:

1. **Marcas.** Patrocinador é logo, e logo é imagem. Hoje eu leio o `alt` da
   `<img>`. Se alguém subir um logo sem `alt`, aquela marca some da base e a
   Kcal passa a dizer que não tem a lista.
2. **Contadores animados.** Na página da NB Run, "1.000 vagas" e "73% mulheres"
   são contadores que sobem na tela. No HTML eles são `0`. Precisei tratar isso
   na unha.
3. **Preço.** Hoje leio "R$ 547" de um bloco visual. Se o desenho da página
   mudar, o valor pode sair errado — e valor errado no WhatsApp é problema
   comercial, não técnico.

---

## Formato

Só três regras: data em `AAAA-MM-DD`, valor em **centavos** (inteiro, sem ponto
nem vírgula — `54700` = R$ 547,00), e campo que não se aplica vem `null`, nunca
inventado ou omitido.

```json
{
  "atualizado_em": "2026-07-28T13:00:00-03:00",
  "eventos": [
    {
      "slug": "belem-2026",
      "nome": "Nutrição Brasil Belém 2026",
      "cidade": "Belém",
      "uf": "PA",
      "local": "Hotel Sagres",
      "data_inicio": "2026-09-19",
      "data_fim": "2026-09-19",
      "horario": "09h às 21h",
      "status": "ingressos_abertos",
      "url": "https://www.nutricaobrasil.com.br/belem",

      "palestrantes": [
        { "nome": "Brunno Falcão",       "titulo": null,  "funcao": "Anfitrião · CEO Science Play", "tema": null, "confirmado": true },
        { "nome": "Adriana Treme",       "titulo": "Dra.", "funcao": "Médica",        "tema": null, "confirmado": true },
        { "nome": "Aline Zago",          "titulo": "Dra.", "funcao": "Médica",        "tema": null, "confirmado": true },
        { "nome": "André Eluan",         "titulo": null,   "funcao": "Farmacêutico",  "tema": null, "confirmado": true },
        { "nome": "Henrique Freire",     "titulo": "Dr.",  "funcao": "Nutricionista", "tema": null, "confirmado": true },
        { "nome": "Olivia Fernandes",    "titulo": "Dra.", "funcao": "Nutricionista", "tema": null, "confirmado": true },
        { "nome": "Omar de Faria",       "titulo": "Dr.",  "funcao": "Nutricionista", "tema": null, "confirmado": true },
        { "nome": "Victor Prieto",       "titulo": "Dr.",  "funcao": "Médico",        "tema": null, "confirmado": true }
      ],

      "ingressos": [
        {
          "nome": "Imersão",
          "lote": "Lote 1",
          "preco_centavos": 54700,
          "parcelas": 12,
          "parcela_centavos": 5657,
          "vagas_total": null,
          "vagas_restantes": null,
          "encerra_em": null,
          "inclui": [
            "12 horas de imersão em 19/09",
            "8 referências clínicas em 5 trilhas",
            "Bag Experience com kit das marcas parceiras",
            "Coffee break",
            "Certificado oficial de 12h",
            "Networking nos intervalos"
          ]
        },
        {
          "nome": "Premium",
          "lote": "Lote 1",
          "preco_centavos": 94700,
          "parcelas": 12,
          "parcela_centavos": 9794,
          "vagas_total": 50,
          "vagas_restantes": 25,
          "encerra_em": null,
          "inclui": [
            "Tudo da Imersão",
            "Pré-congresso em 18/09, das 19h às 22h",
            "Espaço reservado na frente, com mesa e cadeira",
            "Acesso prioritário a networking com palestrantes"
          ]
        }
      ],

      "marcas": {
        "patrocinadores": ["Nestlé Health Science", "Rousselot", "Prana"],
        "parceiros": ["Belive", "Bold", "Nude", "Farmácia Personale", "Clínica Rhinos"]
      },

      "trilhas": [
        "Metabolic Core", "Era GLP-1", "Músculo & Longevidade",
        "Emagrecimento Social", "Estética Responsável"
      ],

      "avisos": [
        "O endereço exato e as orientações de chegada são enviados por e-mail aos inscritos perto do evento."
      ]
    }
  ]
}
```

---

## Os campos, um a um

| Campo | O que é | Cuidado |
|---|---|---|
| `atualizado_em` | quando o arquivo foi gerado | ISO 8601 com fuso. Serve para eu perceber se o arquivo congelou |
| `status` | `em_breve`, `ingressos_abertos`, `esgotado`, `encerrado` | é o que decide se a Kcal vende ou manda para a lista de espera |
| `palestrantes[].confirmado` | `true` só quando pode ser dito em público | **o mais importante do arquivo.** `false` = a Kcal nunca cita o nome |
| `palestrantes[].titulo` | `Dr.`, `Dra.` ou `null` | a Kcal trata por título; sem isso ela chuta |
| `tema` | título da palestra, ou `null` | `null` é resposta válida: "a grade detalhada sai no site" |
| `preco_centavos` | inteiro em centavos | `54700`, não `547.00` nem `"R$ 547"` |
| `vagas_restantes` | número real, ou `null` | `null` é melhor que número velho. Se não atualiza em tempo real, mande `null` |
| `encerra_em` | quando o lote vira | permite a Kcal avisar antes de o preço subir |
| `marcas` | separado por tipo | **é a lista que pode ser dita.** Marca em negociação não entra |
| `avisos` | frases que a Kcal deve repetir | use para regra que não cabe em campo |

**Tirar é tão importante quanto pôr.** Palestrante que sai da grade tem que sumir
do arquivo ou virar `"confirmado": false` — se ficar, a Kcal continua anunciando.

---

## Como saber que funcionou

Depois de publicar, avise. Eu aponto o monitor para o arquivo e confiro campo a
campo contra o que está na página. Não precisa acertar tudo de primeira: pode
começar só com `palestrantes` e `marcas`, que são os dois que mais causam
resposta errada hoje, e crescer depois.

Se o arquivo sair do ar ou vier quebrado, o monitor volta sozinho a ler o HTML
como faz hoje. Ninguém fica sem resposta por causa disso.
