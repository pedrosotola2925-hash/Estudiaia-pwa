(() => {
  const E = window.Estudia;
  const unitsBySubject = Object.freeze({
    matematica: ['Álgebra', 'Geometría', 'Estadísticas', 'Ecuaciones', 'Funciones', 'Probabilidad'],
    ciencias: ['Células', 'Fotosíntesis', 'Sistemas del cuerpo', 'Fuerzas', 'Energía', 'Ecosistemas'],
    lenguaje: ['Comprensión lectora', 'Gramática', 'Escritura creativa', 'Poesía', 'Oratoria', 'Literatura chilena'],
    historia: ['Chile prehispánico', 'Conquista', 'Independencia', 'República temprana', 'Siglo XX', 'Chile actual'],
    ingles: ['Vocabulario básico', 'Presente simple', 'Pasado simple', 'Futuro', 'Adjetivos', 'Conversación'],
    tecnologia: ['Algoritmos', 'Programación básica', 'Redes', 'Seguridad digital', 'Robótica', 'Proyectos']
  });
  const cache = new Map();
  let pendingUnits = 0;

  E.features.materias = {
    init() {},

    async getUnits(subjectId, course) {
      E.Core.assertSubject(subjectId);
      E.Core.assertCourse(course);
      const key = `${course}:${subjectId}`;
      if (!cache.has(key)) cache.set(key, unitsBySubject[subjectId]);
      return [...cache.get(key)];
    },

    render() {
      const cont = document.getElementById('materias-cont');
      cont.replaceChildren(E.ui.el('h2', '📖 Materias'));
      const grid = E.ui.el('div', '', 'grid');
      for (const subject of E.Core.SUBJECTS) {
        const card = E.ui.el('article', '', 'card');
        card.dataset.subject = subject.id;
        card.append(E.ui.el('div', subject.emoji, 'subject-emoji'));
        card.append(E.ui.el('h3', subject.nombre));
        const button = E.ui.button('Ver unidades', async () => {
          const token = ++pendingUnits;
          button.disabled = true;
          button.textContent = 'Cargando unidades…';
          try {
            const units = await this.getUnits(subject.id, E.course());
            if (token !== pendingUnits) return;
            this.renderUnits(subject, units, E.course());
          } finally {
            button.disabled = false;
            button.textContent = 'Ver unidades';
          }
        });
        card.append(button);
        grid.append(card);
      }
      cont.append(grid);
    },

    renderUnits(subject, units, course) {
      const cont = document.getElementById('materias-cont');
      const title = E.ui.el('h2', `${subject.emoji} ${subject.nombre}`);
      const hint = E.ui.el('p', `Unidades sugeridas para ${course}.`, 'sub');
      const list = E.ui.el('ul', '', 'unit-list');
      for (const unit of units) list.append(E.ui.el('li', unit));
      const back = E.ui.button('← Volver a materias', () => this.render(), 'btn secondary');
      cont.replaceChildren(title, hint, list, back);
    },

    leave() {
      pendingUnits += 1;
    }
  };
})();
