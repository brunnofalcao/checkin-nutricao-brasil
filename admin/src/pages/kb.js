import { h, setContent } from '../core/dom.js';
import { icons } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { openModal } from '../ui/modal.js';
import { fmtRelative, fmtDateTime } from '../core/utils.js';
import {
  listKbTopics,
  createKbTopic,
  updateKbTopic,
  setKbTopicActive,
  deleteKbTopic,
  slugifyTopic
} from '../data/ai-kb.js';

// ── Base de Conhecimento (Kcal) ──────────────────────────────────────────────
// CRUD da tabela ai_kb para a equipe editar o que a Kcal responde — sem deploy.

export async function pageKb(view) {
  setContent(view, h('div', { class: 'loading-row' }, h('span', { class: 'loader' })));

  let topics = [];
  try {
    topics = await listKbTopics();
  } catch (e) {
    setContent(view, h('div', { class: 'empty' },
      h('div', { class: 'empty-icon' }, icons.alert()),
      h('div', { class: 'empty-title' }, 'Erro ao carregar a base'),
      h('div', { class: 'empty-body' }, e.message || 'Verifique a conexão e tente de novo.'),
      h('button', { class: 'btn btn-secondary', onclick: () => pageKb(view) }, 'Tentar novamente')
    ));
    return;
  }

  let filter = 'todos'; // todos | ativos | inativos
  let query = '';

  async function reload() {
    try {
      topics = await listKbTopics();
      renderTable();
    } catch (e) {
      toast.danger('Erro ao recarregar: ' + e.message);
    }
  }

  function getFiltered() {
    let list = topics.slice();
    if (filter === 'ativos') list = list.filter((t) => t.active);
    if (filter === 'inativos') list = list.filter((t) => !t.active);
    if (query) {
      const q = query.toLowerCase().trim();
      list = list.filter(
        (t) =>
          (t.topic || '').toLowerCase().includes(q) ||
          (t.title || '').toLowerCase().includes(q) ||
          (t.content || '').toLowerCase().includes(q)
      );
    }
    return list;
  }

  function render() {
    setContent(
      view,
      h('div', { class: 'page-head' },
        h('div', {},
          h('h1', { class: 'page-title' }, 'Base de Conhecimento'),
          h('div', { class: 'page-sub' }, 'O que a Kcal responde no WhatsApp. O que você salva aqui entra no ar imediatamente — sem deploy.')
        ),
        h('div', { class: 'page-actions' },
          h('button', { class: 'btn btn-primary', onclick: () => openEditModal(null) },
            icons.plus(), 'Novo tópico'
          )
        )
      ),

      h('div', { class: 'kb-note' },
        icons.info(),
        h('span', {},
          'A Kcal usa apenas os tópicos ', h('strong', {}, 'ativos'), '. Se um assunto for temporário, prefira ',
          h('strong', {}, 'desativar'), ' em vez de excluir.'
        )
      ),

      h('div', { class: 'table-card', id: 'kb-table' })
    );
    renderTable();
  }

  function renderTable() {
    const container = document.getElementById('kb-table');
    if (!container) return;

    const counts = {
      todos: topics.length,
      ativos: topics.filter((t) => t.active).length,
      inativos: topics.filter((t) => !t.active).length
    };

    setContent(container,
      h('div', { class: 'table-toolbar' },
        h('div', { class: 'toolbar-search' },
          icons.search(),
          h('input', {
            type: 'text',
            placeholder: 'Buscar por tópico, título ou conteúdo...',
            value: query,
            oninput: (e) => { query = e.target.value; updateBody(); }
          })
        ),
        h('div', { style: { display: 'flex', gap: '4px', marginLeft: 'auto', flexWrap: 'wrap' } },
          tabBtn(`Todos · ${counts.todos}`, filter === 'todos', () => { filter = 'todos'; renderTable(); }),
          tabBtn(`Ativos · ${counts.ativos}`, filter === 'ativos', () => { filter = 'ativos'; renderTable(); }, 'green'),
          tabBtn(`Inativos · ${counts.inativos}`, filter === 'inativos', () => { filter = 'inativos'; renderTable(); }, 'amber')
        )
      ),
      h('div', { id: 'kb-table-body' })
    );
    updateBody();
  }

  function updateBody() {
    const body = document.getElementById('kb-table-body');
    if (!body) return;

    const filtered = getFiltered();

    if (topics.length === 0) {
      setContent(body,
        h('div', { class: 'loading-row' }, 'Nenhum tópico ainda. Crie o primeiro em "Novo tópico".')
      );
      return;
    }
    if (filtered.length === 0) {
      setContent(body,
        h('div', { class: 'loading-row' },
          query ? `Nenhum resultado para "${query}".` : 'Nenhum tópico neste filtro.'
        )
      );
      return;
    }

    setContent(body,
      h('table', { class: 'table' },
        h('thead', {}, h('tr', {},
          h('th', { style: { width: '46%' } }, 'Tópico'),
          h('th', {}, 'Status'),
          h('th', {}, 'Atualizado'),
          h('th', {}, '')
        )),
        h('tbody', {}, ...filtered.map(rowFor))
      ),
      h('div', { class: 'table-pager' },
        h('span', {}, `${filtered.length} ${filtered.length === 1 ? 'tópico' : 'tópicos'}`)
      )
    );
  }

  function rowFor(t) {
    return h('tr', { onclick: () => openEditModal(t) },
      h('td', {},
        h('div', { class: 'row-name' }, t.title || t.topic),
        h('div', { class: 'row-sub mono' }, t.topic)
      ),
      h('td', {},
        h('span', {
          class: `status status-toggle ${t.active ? 'live' : 'done'}`,
          title: t.active ? 'Clique para desativar' : 'Clique para ativar',
          onclick: (e) => { e.stopPropagation(); toggleActive(t); }
        }, t.active ? 'Ativo' : 'Inativo')
      ),
      h('td', { class: 'mono', title: fmtDateTime(t.updated_at) }, fmtRelative(t.updated_at)),
      h('td', { style: { textAlign: 'right', color: 'var(--ink-mute)' } },
        h('span', { class: 'kb-edit-hint' }, 'Editar')
      )
    );
  }

  async function toggleActive(t) {
    const next = !t.active;
    t.active = next; // otimista
    updateBody();
    try {
      const saved = await setKbTopicActive(t.id, next);
      Object.assign(t, saved);
      toast.success(next ? `"${t.title}" ativado — Kcal já usa` : `"${t.title}" desativado`);
      renderTable();
    } catch (e) {
      t.active = !next; // reverte
      updateBody();
      toast.danger('Erro ao salvar: ' + e.message);
    }
  }

  function openEditModal(existing) {
    const isNew = !existing;
    let form;

    const { close } = openModal({
      title: isNew ? 'Novo tópico' : 'Editar tópico',
      body: () => {
        form = h('div', {},
          h('div', { class: 'field' },
            h('label', {}, 'Chave do tópico'),
            h('input', {
              class: 'input mono',
              name: 'topic',
              value: existing?.topic || '',
              placeholder: 'ex: credenciamento_corrida',
              onblur: (e) => { e.target.value = slugifyTopic(e.target.value); }
            }),
            h('div', { class: 'kb-field-hint' }, 'Identificador interno (minúsculas e _). Precisa ser único.')
          ),
          h('div', { class: 'field' },
            h('label', {}, 'Título'),
            h('input', {
              class: 'input',
              name: 'title',
              value: existing?.title || '',
              placeholder: 'ex: Credenciamento — retirada de kit da corrida'
            })
          ),
          h('div', { class: 'field' },
            h('label', {}, 'Conteúdo (o que a Kcal deve saber)'),
            h('textarea', {
              class: 'input kb-textarea',
              name: 'content',
              rows: 14,
              placeholder: 'Escreva em texto corrido, com fatos objetivos (datas, locais, valores, regras). A Kcal usa este texto como fonte da resposta.'
            }, existing?.content || '')
          ),
          h('label', { class: 'kb-active-row' },
            h('input', { type: 'checkbox', name: 'active', checked: existing ? !!existing.active : true }),
            h('span', {}, 'Ativo — a Kcal pode usar este tópico nas respostas')
          )
        );
        return form;
      },
      actions: [
        !isNew
          ? {
              label: 'Excluir',
              kind: 'btn-ghost kb-del',
              onClick: (closeFn) => { closeFn(); confirmDelete(existing); }
            }
          : null,
        { label: 'Cancelar', kind: 'btn-ghost', onClick: (closeFn) => closeFn() },
        {
          label: isNew ? 'Criar tópico' : 'Salvar',
          kind: 'btn-primary',
          onClick: async (closeFn) => {
            const get = (n) => form.querySelector(`[name=${n}]`);
            const topic = slugifyTopic(get('topic').value);
            const title = get('title').value.trim();
            const content = get('content').value.trim();
            const active = get('active').checked;

            if (!topic) { toast.danger('Informe a chave do tópico.'); return; }
            if (!title) { toast.danger('Informe o título.'); return; }
            if (!content) { toast.danger('O conteúdo não pode ficar vazio.'); return; }

            const duplicate = topics.find((t) => t.topic === topic && t.id !== existing?.id);
            if (duplicate) {
              toast.danger(`Já existe um tópico com a chave "${topic}". Edite o existente ou use outra chave.`);
              return;
            }

            const btns = form.closest('.modal')?.querySelectorAll('footer .btn');
            btns?.forEach((b) => (b.disabled = true));
            try {
              if (isNew) {
                await createKbTopic({ topic, title, content, active });
                toast.success('Tópico criado — Kcal já usa');
              } else {
                await updateKbTopic(existing.id, { topic, title, content, active });
                toast.success('Tópico salvo — Kcal já usa a nova versão');
              }
              closeFn();
              await reload();
            } catch (e) {
              btns?.forEach((b) => (b.disabled = false));
              toast.danger('Erro ao salvar: ' + e.message);
            }
          }
        }
      ].filter(Boolean)
    });
  }

  function confirmDelete(t) {
    openModal({
      title: 'Excluir tópico',
      body: h('div', {},
        h('p', { class: 'kb-del-warn' },
          'Excluir ', h('strong', {}, `"${t.title}"`), ' é definitivo. A Kcal deixa de saber este assunto ',
          h('strong', {}, 'imediatamente'), '.'
        ),
        h('p', { class: 'kb-del-warn muted' }, 'Se a dúvida é temporária, desativar resolve sem perder o texto.')
      ),
      actions: [
        { label: 'Cancelar', kind: 'btn-ghost', onClick: (closeFn) => closeFn() },
        {
          label: 'Excluir definitivamente',
          kind: 'btn-primary kb-del-confirm',
          onClick: async (closeFn) => {
            try {
              await deleteKbTopic(t.id);
              toast.success('Tópico excluído');
              closeFn();
              await reload();
            } catch (e) {
              toast.danger('Erro ao excluir: ' + e.message);
            }
          }
        }
      ]
    });
  }

  render();
}

// Botão de aba (mesmo padrão do detalhe do evento).
function tabBtn(label, active, onClick, accent) {
  const colorActive = accent === 'green'
    ? 'var(--green)'
    : accent === 'amber'
      ? 'var(--amber)'
      : 'var(--ink-strong)';
  const bgActive = accent === 'green'
    ? 'var(--green-soft)'
    : accent === 'amber'
      ? 'var(--amber-soft)'
      : 'var(--bg-2)';
  return h('button', {
    class: 'btn',
    style: {
      padding: '6px 12px',
      height: 'auto',
      fontSize: '12px',
      background: active ? bgActive : 'transparent',
      color: active ? colorActive : 'var(--ink-soft)'
    },
    onclick: onClick
  }, label);
}
