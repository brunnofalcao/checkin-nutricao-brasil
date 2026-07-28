# A Kcal parou de responder com fato velho

**4 arquivos.** Suba mantendo as pastas. O banco e a função já estão aplicados —
a parte que corrige as respostas da Kcal **já está no ar desde agora**, o ZIP é a
tela para você acompanhar.

```
admin/src/data/ai-kb.js
admin/src/pages/kb.js
admin/assets/css/pages.css
supabase/functions/kb-site-monitor/index.ts   ← só registro; já publiquei
```

---

## O que estava acontecendo

O monitor do site rodava todo dia às 7h, sem falhar nenhuma vez. Ele lia as
páginas, via que mudaram e escrevia um alerta no banco: *"rodar análise da
mudança e atualizar a Base de Conhecimento"*.

Esse alerta era para uma pessoa ler. Ninguém lia. **Havia 9 alertas parados
desde 25/07** e a Base de Conhecimento seguia com o texto de 23/07.

Era um detector de fumaça sem campainha.

E não era só Belém. Enquanto a base envelhecia, a Kcal estava:

- dizendo que **existem quatro módulos**, quando o site vende cinco — faltava o
  **Golden Experience, R$1.997**, o ingresso mais caro da grade;
- respondendo que **não estavam na programação publicada** nomes que já estavam
  no site: Dr. Igor Caleb, Dra. Andrea Zaccaro, Dr. Thiago Cabral, Dra. Giselle
  Santos, Dra. Bettina Moritz, Dr. Henrique Freire, Dra. Juliana Bicca,
  Dra. Lorena Tomazett, Dra. Bruna Pitaluga e Dr. Victor Sorrentino;
- mandando quem perguntava da largada para a **Praça do Buriti às 7h**, endereço
  que o site já tinha tirado do ar;
- falando em **1.500 corredores** quando a página da NB Run fechou o pelotão em
  mil.

Belém foi só o caso que você viu, porque a campanha tinha acabado de sair.

---

## O estrago de hoje de manhã

A campanha de Belém saiu 09:14. Entre 10:04 e 10:19, **quatro pessoas
perguntaram sobre Belém e receberam resposta errada**:

| Número | O que a Kcal respondeu |
|---|---|
| 61 98138-2900 | "Não tenho a lista de patrocinadores de Belém confirmada" |
| 94 9170-1696 | "Para Belém ainda não temos os valores e detalhes de lotes confirmados" |
| 61 9127-3866 | "A programação de Belém ainda está sendo confirmada" |

A do meio é a pior: a campanha mandou a pessoa comprar e o atendimento disse que
não tem preço. O site tem: R$547 e R$947.

**Vale um retorno manual nesses três.** Um deles (61 98138-2900) ficou marcado
como conversa de humano, então a Kcal não vai voltar a falar sozinha com ele.

---

## O que já está no ar

A Base de Conhecimento foi atualizada agora, contra o texto real das páginas.
Confirmei cada fato no HTML do site antes de gravar — inclusive os nomes das
marcas, que estão em logo e eu li do `alt` da imagem, não de resumo.

**Belém ganhou tópico próprio:** data, Hotel Sagres, 09h às 21h, pré-congresso
do dia 18, as cinco trilhas, os **8 palestrantes confirmados**, os dois lotes com
valores e parcelamento, o que cada um inclui, e o aviso de que o Premium tem
50 vagas e está pela metade.

**Patrocinadores viraram tópico** — não existia nenhum, por isso a Kcal não
sabia responder nem de Brasília. Belém: Nestlé Health Science, Rousselot e Prana
como patrocinadores; Belive, Bold, Nude, Farmácia Personale e Clínica Rhinos como
parceiras. Brasília: Puravida, Moving, Nestlé Health Science, Pilbox e Caffeine
Army. Goiânia e Porto Alegre: nada anunciado, e está escrito para não citar nome.
Quem pergunta porque quer patrocinar é mandado para o comercial, não recebe só a
lista.

E os quatro tópicos que estavam velhos — ingressos, plenária, esportiva e
MedBrasil — foram reescritos a partir da página de hoje.

---

## O que muda daqui pra frente

O monitor deixou de só avisar. Agora ele **lê a mudança e reescreve o tópico**.

Todo dia às 7h ele passa nas páginas. Quando alguma muda, compara com o que a
Kcal sabe hoje e grava a versão nova — guardando a anterior. Na prática:
**você arruma o site e a Kcal já está certa no dia seguinte, sem pedir nada
a ninguém.**

As travas, porque isso escreve no que a Kcal fala com cliente:

- só reescreve página que tem tópico apontado. Página nova só avisa — nunca
  inventa assunto sozinha;
- a reescrita passa por uma barreira antes de gravar: encolheu demais, inchou
  demais ou veio com recado do modelo, não sobe — vira proposta;
- **toda alteração guarda o texto anterior.** Desfazer é um clique;
- se a releitura falhar, o tópico fica como está e entra um erro na lista. Nunca
  apaga o que já estava certo.

Deixei em **automático**. Na tela nova você troca para "só propor" (espera sua
aprovação) ou "desligada" a qualquer momento, sem mexer em código.

---

## A tela nova

Em Marketing → Base de Conhecimento, acima dos tópicos, apareceu
**Sincronização com o site**: quantas páginas são lidas, quando foi a última
leitura, o que mudou, e o botão **Comparar** mostrando lado a lado o texto que
está no ar e o que entrou.

O que foi publicado sozinho fica listado com **Desfazer**. Se alguma reescrita
não te agradar, você volta na hora — sem me chamar.

Também mudei uma coisa que não era da sua pergunta: o selo *Ativo* fica bem no
meio da linha do tópico, e a linha inteira é clicável. Um clique torto
desativava o assunto na hora, e tópico desativado **some da cabeça da Kcal
imediatamente**. Agora desativar pergunta antes; reativar continua um clique só.

---

## Sobre o arquivo que você pediu

Você perguntou se dá para pôr no código-fonte um arquivo de texto que ela
consulte sempre. A ideia está certa, o lugar é que não.

**No código-fonte, cada correção vira um deploy** — e só eu ou um dev consegue
fazer. Uma vírgula de preço errada às 22h de um sábado espera segunda. Esse
arquivo já existe, só que mora no banco: é a Base de Conhecimento. A Kcal lê
**todos os tópicos ativos a cada mensagem**, e o que você salva na tela vale no
segundo seguinte.

O que faltava não era o arquivo. Era o cano ligando o site nele — e é isso que
está feito.

**Mas tem uma versão melhor da sua ideia**, e essa é do lado do site. Hoje eu leio
a página como um humano lê: pego o HTML e interpreto. Funciona, e você viu
funcionando. Só que quebra se mudarem o layout, e me obriga a adivinhar coisas
que o site já sabe de forma exata — os contadores animados da NB Run, por
exemplo, aparecem como "0" no código.

O caminho limpo é o site publicar um endereço só de dados, tipo
`nutricaobrasil.com.br/kb.json`, com palestrantes, lotes, patrocinadores e datas
já estruturados. Quem mexe no site não faz nada a mais: publicou a página,
publicou o arquivo. E eu paro de interpretar — passo a ler o número exato.

Deixei a especificação pronta em **`spec-kb-json.md`**, com o formato e um
exemplo já preenchido com os dados reais de Belém. É para você encaminhar para
quem cuida do site. Enquanto isso não existe, o que montei hoje continua
rodando — um não depende do outro.

---

## Duas coisas para você decidir

**O site está se contradizendo sobre a NB Run.** A home diz "1.500 corredores",
a página da corrida diz "pelotão fechado em mil". Coloquei mil na base, que é o
número da página oficial da prova. Se o certo for 1.500, é a home que está
certa e a página da corrida precisa mudar.

**A página `/programacao/corrida-de-rua` está órfã.** Ela e a `/corrida`
disputavam o mesmo tópico e se sobrescreviam. Deixei a `/corrida` mandando, e a
outra só avisando. Se elas contarem coisas diferentes, vale unificar no site.

---

## Como testei

Rodei a varredura de botões no painel inteiro com a tela nova incluída:
**0 botão morto, 0 erro de console.**

Mais 26 verificações só na sincronização: publicar, desfazer, comparar antes e
depois, trocar o modo, dispensar alerta, e o CRUD de tópicos continuando de pé.
Todas conferindo **o que foi gravado**, não só o que a tela mostrou — foi
exatamente essa diferença que uma vez deixou passar um erro para produção.

A reescrita eu não deixei subir no escuro: rodei primeiro em modo "só propor",
li as sete propostas uma a uma e conferi cada fato contra o HTML da página
— inclusive os que pareciam estranhos. A largada da Praça do Buriti sumiu
mesmo do site (procurei em todas as páginas monitoradas: zero ocorrências), e o
Golden Experience existe mesmo. Só depois liguei o automático.
