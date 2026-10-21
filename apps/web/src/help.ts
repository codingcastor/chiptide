import { CATEGORIES, type FunctionDoc } from '@chiptide/engine';

/** Searchable reference of the functions, built from the engine's catalogue. */
export class HelpPanel {
  constructor(
    parent: HTMLElement,
    docs: readonly FunctionDoc[],
    onTry: (code: string, name: string) => void,
  ) {
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = 'Rechercher une fonction…';
    search.setAttribute('aria-label', 'Rechercher dans l’aide');
    const list = document.createElement('div');
    list.className = 'help-list';
    parent.append(search, list);

    const entries = docs.map((doc) => {
      const item = document.createElement('article');
      item.className = 'help-item';
      item.dataset.category = doc.category;
      const sig = document.createElement('code');
      sig.className = 'help-signature';
      sig.textContent = doc.signature;
      const summary = document.createElement('p');
      summary.textContent = doc.summary;
      item.append(sig, summary);
      if (doc.details) {
        const details = document.createElement('p');
        details.className = 'help-details';
        details.textContent = doc.details;
        item.append(details);
      }
      const example = document.createElement('pre');
      example.textContent = doc.example;
      const actions = document.createElement('div');
      actions.className = 'help-actions';
      const listen = document.createElement('button');
      listen.type = 'button';
      listen.textContent = '▶ Écouter';
      listen.title = 'Jouer cet exemple seul, sans modifier votre code';
      listen.addEventListener('click', () => onTry(doc.example, doc.name));
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.textContent = 'Copier';
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(doc.example);
          copy.textContent = 'Copié';
        } catch {
          copy.textContent = 'Copie impossible';
        }
        setTimeout(() => (copy.textContent = 'Copier'), 1500);
      });
      actions.append(listen, copy);
      item.append(example, actions);
      return {
        doc,
        item,
        text: `${doc.name} ${doc.signature} ${doc.summary} ${doc.details ?? ''}`.toLowerCase(),
      };
    });

    const headings = CATEGORIES.map((category) => {
      const h = document.createElement('h3');
      h.textContent = category;
      list.append(h);
      for (const e of entries) if (e.doc.category === category) list.append(e.item);
      return { category, h };
    });

    search.addEventListener('input', () => {
      const query = search.value.trim().toLowerCase();
      for (const e of entries) e.item.hidden = query !== '' && !e.text.includes(query);
      for (const { category, h } of headings) {
        h.hidden = entries.every((e) => e.doc.category !== category || e.item.hidden);
      }
    });
  }
}
