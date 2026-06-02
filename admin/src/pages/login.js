import { h, setContent } from '../core/dom.js';
import { signIn } from '../data/auth.js';

export function renderLogin(rootEl, onSuccess) {
  let loading = false;
  let errorMsg = null;

  function render() {
    const errorNode = errorMsg ? h('div', { class: 'login-error' }, errorMsg) : null;

    const form = h(
      'form',
      {
        onsubmit: async (e) => {
          e.preventDefault();
          if (loading) return;
          const email = form.querySelector('[name=email]').value;
          const password = form.querySelector('[name=password]').value;

          loading = true;
          errorMsg = null;
          render();

          try {
            await signIn(email, password);
            onSuccess();
          } catch (err) {
            errorMsg = friendly(err.message);
            loading = false;
            render();
          }
        }
      },
      errorNode,
      h(
        'div',
        { class: 'field' },
        h('label', { for: 'login-email' }, 'Email'),
        h('input', {
          id: 'login-email',
          name: 'email',
          type: 'email',
          class: 'input',
          autocomplete: 'email',
          required: true,
          autofocus: true,
          placeholder: 'voce@scienceplay.com'
        })
      ),
      h(
        'div',
        { class: 'field' },
        h('label', { for: 'login-password' }, 'Senha'),
        h('input', {
          id: 'login-password',
          name: 'password',
          type: 'password',
          class: 'input',
          autocomplete: 'current-password',
          required: true
        })
      ),
      h(
        'button',
        { type: 'submit', class: 'btn btn-primary btn-block', disabled: loading },
        loading ? h('span', { class: 'loader' }) : 'Entrar'
      )
    );

    const card = h(
      'div',
      { class: 'login-shell' },
      h(
        'div',
        { class: 'login-card' },
        h(
          'div',
          { class: 'login-brand' },
          'nutrição',
          h('span', {}, 'brasil')
        ),
        h('div', { class: 'login-sub' }, 'Painel administrativo'),
        form
      )
    );

    setContent(rootEl, card);
  }

  render();
}

function friendly(msg) {
  if (!msg) return 'Erro ao entrar';
  if (/Invalid login credentials/i.test(msg)) return 'Email ou senha incorretos.';
  if (/Email not confirmed/i.test(msg)) return 'Email ainda não confirmado.';
  return msg;
}
