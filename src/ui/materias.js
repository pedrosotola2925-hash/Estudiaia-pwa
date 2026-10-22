(() => {
  const E = window.Estudia;
  const unitsBySubject = Object.freeze({
    matematica: {
      '3º básico': ['Números naturales', 'Suma y resta', 'Multiplicación', 'División', 'Fracciones', 'Geometría básica'],
      '4º básico': ['Números hasta 10000', 'Operaciones combinadas', 'Fracciones equivalentes', 'Decimales', 'Perímetro y área', 'Estadística'],
      '5º básico': ['Potencias y raíces', 'Múltiplos y divisores', 'Fracciones y decimales', 'Porcentajes', 'Ángulos', 'Prismas'],
      '6º básico': ['Números enteros', 'Expresiones algebraicas', 'Ecuaciones lineales', 'Proporcionalidad', 'Cuerpos geométricos', 'Probabilidad'],
      '7º básico': ['Álgebra', 'Geometría', 'Estadísticas', 'Ecuaciones', 'Funciones', 'Probabilidad'],
      '8º básico': ['Funciones cuadráticas', 'Teorema de Pitágoras', 'Trigonometría básica', 'Estadística descriptiva', 'Polinómicos', 'Sistemas de ecuaciones'],
      'I medio': ['Funciones polinómicas', 'Límites y continuidad', 'Derivadas', 'Aplicaciones de la derivada', 'Integrales', 'Modelamiento'],
      'II medio': ['Funciones trigonométricas', 'Identidades', 'Ecuaciones trigonométricas', 'Vectores', 'Geometría analítica', 'Cónicas'],
      'III medio': ['Límites avanzados', 'Derivadas de orden superior', 'Integrales definidas', 'Ecuaciones diferenciales', 'Sucesiones y series', 'Probabilidad condicional'],
      'IV medio': ['Cálculo multivariable', 'Álgebra lineal', 'Estadística inferencial', 'Optimización', 'Modelamiento matemático', 'Proyecto integrador']
    },
    ciencias: {
      '3º básico': ['Seres vivos', 'Plantas y animales', 'Cuerpo humano', 'Materia y energía', 'Fuerzas', 'Tierra y universo'],
      '4º básico': ['Clasificación seres vivos', 'Ecosistemas', 'Sistemas del cuerpo', 'Estados de la materia', 'Electricidad', 'Sistema solar'],
      '5º básico': ['Células', 'Fotosíntesis', 'Sistemas corporales', 'Cambios de materia', 'Fuerzas y movimiento', 'Clima'],
      '6º básico': ['Microorganismos', 'Herencia', 'Nutrición', 'Reacciones químicas', 'Energía', 'Tierra'],
      '7º básico': ['Células', 'Fotosíntesis', 'Sistemas del cuerpo', 'Fuerzas', 'Energía', 'Ecosistemas'],
      '8º básico': ['Genética', 'Evolución', 'Homeostasis', 'Química', 'Electricidad', 'Universo'],
      'I medio': ['Bioquímica', 'Genética molecular', 'Fisiología', 'Termodinámica', 'Ondas', 'Átomos'],
      'II medio': ['Biología celular', 'Biotecnología', 'Química orgánica', 'Electromagnetismo', 'Óptica', 'Cosmología'],
      'III medio': ['Neurobiología', 'Inmunología', 'Química física', 'Mecánica cuántica', 'Relatividad', 'Astrofísica'],
      'IV medio': ['Biología de sistemas', 'Nanotecnología', 'Química verde', 'Física de partículas', 'Cambio climático', 'Proyecto STEM']
    },
    lenguaje: {
      '3º básico': ['Lectura', 'Escritura', 'Gramática', 'Vocabulario', 'Oralidad', 'Literatura'],
      '4º básico': ['Comprensión', 'Textos narrativos', 'Sintaxis', 'Ortografía', 'Exposición', 'Poesía'],
      '5º básico': ['Análisis textual', 'Escritura argumentativa', 'Morfología', 'Lexicología', 'Debate', 'Teatro'],
      '6º básico': ['Crítica literaria', 'Escritura académica', 'Semántica', 'Pragmática', 'Oratoria', 'Novela'],
      '7º básico': ['Comprensión lectora', 'Gramática', 'Escritura creativa', 'Poesía', 'Oratoria', 'Literatura chilena'],
      '8º básico': ['Análisis crítico', 'Ensayo', 'Lingüística', 'Retórica', 'Comunicación', 'Literatura latinoamericana'],
      'I medio': ['Teoría literaria', 'Crítica', 'Estilística', 'Semiótica', 'Periodismo', 'Literatura universal'],
      'II medio': ['Hermenéutica', 'Escritura creativa avanzada', 'Sociolingüística', 'Discurso', 'Medios', 'Literatura comparada'],
      'III medio': ['Estética', 'Traducción', 'Pragmática avanzada', 'Discurso digital', 'Literatura contemporánea', 'Tesis'],
      'IV medio': ['Investigación literaria', 'Edición', 'Comunicación estratégica', 'Literatura digital', 'Crítica cultural', 'Proyecto final']
    },
    historia: {
      '3º básico': ['Mi comunidad', 'Chile antiguo', 'Llegada españoles', 'Independencia', 'Chile hoy', 'Patrimonio'],
      '4º básico': ['Pueblos originarios', 'Conquista', 'Colonia', 'Patria vieja', 'República', 'Chile actual'],
      '5º básico': ['América precolombina', 'Conquista América', 'Colonial', 'Independencias', 'Siglo XIX', 'Mundo actual'],
      '6º básico': ['Civilizaciones antiguas', 'Edad Media', 'Renacimiento', 'Ilustración', 'Revoluciones', 'Guerras mundiales'],
      '7º básico': ['Chile prehispánico', 'Conquista', 'Independencia', 'República temprana', 'Siglo XX', 'Chile actual'],
      '8º básico': ['América Latina', 'Imperialismo', 'Guerra Fría', 'Derechos humanos', 'Globalización', 'Chile democrático'],
      'I medio': ['Historia antigua', 'Medieval', 'Moderna', 'Contemporánea', 'Historia de Chile', 'Historia económica'],
      'II medio': ['Historiografía', 'Historia social', 'Historia cultural', 'Historia política', 'Chile siglo XX', 'Relaciones internacionales'],
      'III medio': ['Teoría histórica', 'Historia de las ideas', 'Historia ambiental', 'Historia de género', 'Memoria', 'Historia digital'],
      'IV medio': ['Epistemología histórica', 'Patrimonio', 'Historia pública', 'Globalización', 'Futuros', 'Investigación histórica']
    },
    ingles: {
      '3º básico': ['Saludos', 'Colores', 'Números', 'Familia', 'Animales', 'Comida'],
      '4º básico': ['Rutinas', 'Escuela', 'Pasatiempos', 'Ciudad', 'Clima', 'Viajes'],
      '5º básico': ['Pasado simple', 'Futuro', 'Comparativos', 'Modales', 'Cuentos', 'Proyectos'],
      '6º básico': ['Presente perfecto', 'Pasado continuo', 'Condicionales', 'Voz pasiva', 'Reported speech', 'Essays'],
      '7º básico': ['Vocabulario básico', 'Presente simple', 'Pasado simple', 'Futuro', 'Adjetivos', 'Conversación'],
      '8º básico': ['Perfectos', 'Modales avanzados', 'Condicionales mixtos', 'Cláusulas', 'Escritura formal', 'Debate'],
      'I medio': ['Inglés académico', 'TOEFL/IELTS', 'Literatura', 'Presentaciones', 'Negocios', 'Cultura'],
      'II medio': ['Inglés técnico', 'Traducción', 'Literatura avanzada', 'Investigación', 'Negociación', 'Cultura avanzada'],
      'III medio': ['Académico avanzado', 'Certificación', 'Literatura crítica', 'Investigación bilingüe', 'Interculturalidad', 'Proyecto'],
      'IV medio': ['Dominio profesional', 'Certificación experta', 'Investigación bilingüe', 'Publicación', 'Docencia', 'Portafolio']
    },
    tecnologia: {
      '3º básico': ['Computadora', 'Internet seguro', 'Algoritmos simples', 'Robótica básica', 'Dibujo digital', 'Proyectos'],
      '4º básico': ['Ofimática', 'Programación Scratch', 'Diseño 3D', 'Robótica', 'Ciudadanía digital', 'Proyectos'],
      '5º básico': ['Python básico', 'Web HTML/CSS', 'Arduino', 'IA intro', 'Ética digital', 'Proyectos'],
      '6º básico': ['Python intermedio', 'JavaScript', 'Bases de datos', 'Apps', 'Seguridad', 'Proyectos'],
      '7º básico': ['Algoritmos', 'Programación básica', 'Redes', 'Seguridad digital', 'Robótica', 'Proyectos'],
      '8º básico': ['POO', 'Frameworks', 'Backend', 'DevOps', 'IA/ML', 'Proyecto real'],
      'I medio': ['Estructuras de datos', 'Algoritmos avanzados', 'Arquitectura', 'Cloud', 'Ciberseguridad', 'Proyecto'],
      'II medio': ['Sistemas distribuidos', 'ML/AI', 'Blockchain', 'IoT', 'Arquitectura empresarial', 'Proyecto'],
      'III medio': ['Arquitectura cloud native', 'MLOps', 'Quantum computing', 'Bioinformática', 'Ética IA', 'Proyecto'],
      'IV medio': ['Arquitectura enterprise', 'AI governance', 'Computación cuántica', 'Innovación', 'Emprendimiento', 'Proyecto final']
    }
  });
  const cache = new Map();
  let pendingUnits = 0;

  E.features.materias = {
    init() {},

    async getUnits(subjectId, course) {
      E.Core.assertSubject(subjectId);
      E.Core.assertCourse(course);
      const key = `${course}:${subjectId}`;
      if (!cache.has(key)) {
        const subjectUnits = unitsBySubject[subjectId];
        const units = subjectUnits[course] || subjectUnits['7º básico'] || [];
        cache.set(key, units);
      }
      return [...cache.get(key)];
    },

    render() {
      const cont = document.getElementById('materias-cont');
      const course = E.course();
      cont.replaceChildren(E.ui.el('h2', `📖 Materias — ${course}`));
      const grid = E.ui.el('div', '', 'grid');
      for (const subject of E.Core.SUBJECTS) {
        const card = E.ui.el('article', '', 'card');
        card.dataset.subject = subject.id;
        card.append(E.ui.el('div', subject.emoji, 'subject-emoji'));
        const titleContainer = E.ui.el('div', '', 'subject-title');
        titleContainer.setAttribute('style', 'display:flex; align-items:center; gap:8px;');
        titleContainer.append(E.ui.el('h3', subject.nombre));
        card.append(titleContainer);
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
      const hint = E.ui.el('p', `Haz clic en una unidad para ver su lección interactiva.`, 'sub');
      const list = E.ui.el('ul', '', 'unit-list');
      for (const unit of units) {
        const li = E.ui.el('li', '', 'unit-item');
        li.setAttribute('style', 'display:flex; align-items:center; gap:8px; cursor:pointer;');
        const unitText = E.ui.el('span', unit);
        unitText.onclick = () => this.selectUnit(subject, unit, course);
        li.append(unitText);
        list.append(li);
      }
      const back = E.ui.button('← Volver a materias', () => this.render(), 'btn secondary');
      cont.replaceChildren(title, hint, list, back);
    },

    selectUnit(subject, unit, course) {
      // Set the lesson topic state for the leccion view
      E.currentLessonTopic = {
        subjectId: subject.id,
        unit: unit,
        course: course
      };
      // Navigate to the lesson view
      E.router.go('leccion');
    },

    leave() {
      pendingUnits += 1;
    }
  };
})();
