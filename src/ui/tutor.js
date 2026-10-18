(() => {
  const E = window.Estudia;
  let activeId = null;

  E.features.tutor = {
    init() {
      const form = document.getElementById('question-form');
      const askHandler = async () => {
        await this.ask(form.searchInput.value.trim());
        form.searchInput.value = '';
      };
      form.onsubmit = E.ui.guard(async e => {
        e.preventDefault();
        await askHandler();
      });
      document.getElementById('searchBtn').onclick = E.ui.guard(askHandler);
      document.getElementById('uploadNotesBtn').onclick = E.ui.guard(() => document.getElementById('file-apuntes').click());
      document.getElementById('file-apuntes').onchange = E.ui.guard(async () => {
        const file = document.getElementById('file-apuntes').files[0];
        if (!file) return;
        try {
          await E.features.tutor.uploadNote(file);
        } finally {
          document.getElementById('file-apuntes').value = '';
        }
      });
    },

    async uploadNote(noteFile) {
      try {
        E.Core.validateNoteFile({ name: noteFile.name, mime: noteFile.type, bytes: new Uint8Array(await noteFile.arrayBuffer()) });
      } catch (e) {
        E.ui.message(document.getElementById('upload-confirmation'), e.message, 'error');
        return;
      }
      const confirm = document.getElementById('upload-confirmation');
      const info = E.ui.el('div', `El archivo "${noteFile.name}" se analizará con Gemini. ¿Continuar?`, 'message info');
      const actions = E.ui.el('div', '', 'fila');
      const analyze = E.ui.button('Analizar', async () => {
        confirm.replaceChildren(E.ui.el('div', 'Preparando el archivo…', 'message info'));
        try {
          const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = typeof reader.result === 'string' ? reader.result : '';
              const comma = result.indexOf(',');
              if (comma < 0) reject(new Error('No se pudo leer el archivo.'));
              else resolve(result.slice(comma + 1));
            };
            reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
            reader.readAsDataURL(noteFile);
          });
          confirm.hidden = true;
          confirm.replaceChildren();
          await this.ask('', { kind: 'notes', attachedFile: { name: noteFile.name, mime: noteFile.type, base64 } });
        } catch (e) {
          confirm.hidden = false;
          E.ui.message(confirm, e.message || 'No se pudo leer el archivo.', 'error');
        }
      });
      analyze.id = 'confirm-analyze';
      const cancel = E.ui.button('Cancelar', () => {
        confirm.replaceChildren();
        confirm.hidden = true;
      }, 'btn secondary');
      cancel.id = 'confirm-cancel';
      actions.append(analyze, cancel);
      confirm.replaceChildren(info, actions);
      confirm.hidden = false;
    },

    async ask(text, { kind = 'tutor', context, attachedFile } = {}) {
      const course = E.store.getState().course;
      const requestId = crypto.randomUUID();
      if (activeId) E.request.cancel(activeId);
      activeId = requestId;

      const topic = kind === 'notes' ? `Apunte de ${attachedFile?.name || course}` : text;
      try {
        const result = await E.request.run({
          id: requestId,
          kind,
          course,
          question: kind === 'tutor' ? text : undefined,
          context,
          file: attachedFile
        });
        if (activeId !== requestId || E.store.getState().course !== course) return;
        if (!result || typeof result.text !== 'string' || !result.text.trim()) {
          throw E.Core.invalid('El servicio devolvió una respuesta vacía.');
        }
        this.show(result.text, { source: kind, topic });
      } catch (e) {
        if (e.code !== 'CANCELLED' && activeId === requestId) {
          this.show('No se pudo completar: ' + e.message, { source: kind, topic });
        }
      } finally {
        if (activeId === requestId) activeId = null;
      }
    },

    show(text, { source, topic }) {
      E.voice.setText(text);
      const res = document.getElementById('respuestas');
      res.hidden = false;
      res.replaceChildren(E.ui.renderMarkdown(text));

      const mini = E.Core.parseMiniQuestion(text);
      if (mini) {
        const box = E.ui.el('div', '', { style: 'margin-top:14px;padding:14px;background:#eef2ff;border-radius:14px;' });
        box.append(E.ui.el('strong', '🧠 ' + mini.enunciado));
        const opts = E.ui.el('div', null, 'fila');
        for (const o of mini.opciones) {
          const b = E.ui.button(o.letra + ') ' + o.texto, () => {
            if (b.disabled) return;
            const parent = b.closest('div');
            parent.querySelectorAll('button').forEach(x => { x.disabled = true; });
            if (o.letra === mini.correcta) {
              b.classList.add('correct');
              E.ui.toast('¡Correcto! 🎉', 'success');
            } else {
              b.classList.add('wrong');
              E.ui.toast('Casi 💪 La correcta era ' + mini.correcta + '.', 'error');
            }
          }, 'btn option');
          b.disabled = false;
          opts.append(b);
        }
        box.append(opts);
        res.append(box);
      }

      const actions = E.ui.el('div', '', 'response-actions');
      const understood = E.ui.button('Sí, entendí ✅', () => {
        E.ui.toast('¡Genial! 🎉 Pregunta otra cosa cuando quieras.', 'success');
      }, 'btn verde');
      understood.id = 'btn-entendi';
      const reexplain = E.ui.button('Explícamelo de nuevo 🔄', () => {
        E.features.tutor.ask(topic, { context: 'Reexplica con otra analogía.' });
      }, 'btn');
      reexplain.id = 'btn-reexplicar';
      const another = E.ui.button('Otra pregunta', () => {
        E.router.go('inicio');
        const input = document.getElementById('searchInput');
        input.value = '';
        input.focus();
      }, 'btn secondary');
      another.id = 'btn-otra';
      actions.append(understood, reexplain, another);
      res.append(actions);
    },

    leave() {
      E.request.cancelAll();
      E.voice.stop();
      activeId = null;
      const res = document.getElementById('respuestas');
      if (res) res.hidden = true;
    }
  };
})();
