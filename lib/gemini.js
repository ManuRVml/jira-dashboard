// Polyfill fetch for Node 16 (required by @google/generative-ai)
if (!globalThis.fetch) {
  const nodeFetch = require('node-fetch');
  globalThis.fetch = nodeFetch;
  globalThis.Headers = nodeFetch.Headers;
  globalThis.Request = nodeFetch.Request;
  globalThis.Response = nodeFetch.Response;
}

const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;
let model = null;

function initGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('⚠️  GEMINI_API_KEY not set — AI reports will not be available');
    return false;
  }
  genAI = new GoogleGenerativeAI(apiKey);
  model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  console.log('🤖 Gemini AI initialized (gemini-2.0-flash)');
  return true;
}

async function generateActivityReport(activitiesData, dateRange, userName) {
  if (!model) {
    if (!initGemini()) {
      throw new Error('GEMINI_API_KEY no configurado en .env');
    }
  }

  const prompt = `Eres un asistente que ayuda a preparar el reporte para la daily standup (reunión diaria de equipo). Genera un resumen claro y natural en español de lo que se trabajó, basado en los datos reales de Jira.

CONTEXTO:
- Este reporte será leído en voz alta en una daily de máximo 2-3 minutos
- La audiencia son compañeros de equipo y leads, NO técnicos de infraestructura
- Debe sonar natural, como si la persona estuviera contando qué hizo

FORMATO DEL REPORTE (Markdown):

1. **Resumen rápido** (1-2 líneas): Qué se hizo en general durante el período
2. **Lo que se trabajó**: Lista de tareas en las que hubo actividad, para cada una:
   - Nombre de la tarea (sin claves técnicas de Jira al inicio, pero menciona la clave entre paréntesis al final)
   - Qué se hizo concretamente (avanzó, se cerró, se pasó a validación, se agregó documentación, etc.)
   - Si hubo comunicación relevante con alguien, mencionarlo brevemente
3. **En progreso / Siguiente**: Tareas que quedaron en estado "Doing", "En Progreso" o similar
4. **Bloqueantes** (solo si hay): Tareas en estado "Blocked" o que muestren cambios a ese estado

REGLAS DE ESTILO:
- NO uses lenguaje técnico como "transición de estado", "changelog", "campo modificado"
- En lugar de "Estado cambió de X a Y", di algo como "Se pasó a validación" o "Se retomó la tarea"
- Usa verbos de acción: "Se avanzó en...", "Se completó...", "Se envió a revisión..."
- Sé conciso: cada punto debe ser 1-2 líneas máximo
- Si hay adjuntos subidos, menciona que se compartió documentación
- Si hay comentarios, resume la conversación, no copies el texto exacto
- Usa el formato de fecha DD/MM/YYYY
- NO inventes información que no esté en los datos
- NO incluyas la sección de bloqueantes si no hay ninguno

PERÍODO: ${dateRange.dateFrom} a ${dateRange.dateTo}
PERSONA: ${userName || 'No especificado'}

DATOS DE ACTIVIDADES EN JIRA:
${JSON.stringify(activitiesData, null, 2)}

Genera el reporte para la daily ahora:`;

  const result = await model.generateContent(prompt);
  const response = result.response;
  return response.text();
}

async function generateBlockReport(type, period, casesData, userName) {
  if (!model) {
    if (!initGemini()) {
      throw new Error('GEMINI_API_KEY no configurado en .env');
    }
  }

  const isClosing = type === 'cierre';
  const totalHours = casesData.reduce((sum, c) => sum + (c.hours || 0), 0);
  const totalCases = casesData.length;

  const prompt = `Eres un asistente de gestión de proyectos. Genera un reporte ${isClosing ? 'DE CIERRE' : 'DE AVANCE'} profesional y ejecutivo para un bloque de trabajo, en español.

CONTEXTO:
- Se trabaja por bloques bimestrales (2 meses)
- ${isClosing
    ? 'Este es el REPORTE DE CIERRE del bloque — resume todo lo logrado, entregables, métricas finales y lecciones aprendidas'
    : 'Este es el REPORTE DE AVANCE a mitad del bloque — resume el progreso actual, estado de cada caso y próximos pasos'}
- La audiencia es el cliente y el líder de proyecto
- Debe ser profesional, claro y orientado a resultados

PERÍODO DEL BLOQUE: ${period.label}
PERSONA: ${userName || 'No especificado'}
TOTAL HORAS CONSUMIDAS: ${totalHours}h
TOTAL CASOS: ${totalCases}

FORMATO DEL REPORTE (Markdown):

${isClosing ? `
1. **Resumen ejecutivo**: Párrafo de 3-4 líneas resumiendo el bloque completo
2. **Métricas del bloque**:
   - Total de horas: ${totalHours}h
   - Total de casos: ${totalCases}
   - Casos cerrados vs pendientes
3. **Detalle por caso**: Para cada caso listar:
   - Clave y nombre de la tarea
   - Fecha de creación (campo "created" en formato DD/MM/YYYY)
   - Fecha de cierre: si tiene "resolutionDate" mostrarlo en formato DD/MM/YYYY. Si NO tiene resolutionDate, mostrar "En progreso (última actualización: DD/MM/YYYY)" usando el campo "updated"
   - Horas consumidas
   - Estado final (completado, en progreso, pendiente)
   - Resumen de lo realizado
   - Entregables producidos (si aplica)
4. **Logros del bloque**: Lista de los principales logros y entregables
5. **Pendientes para el siguiente bloque**: Tareas que quedan abiertas
6. **Observaciones**: Lecciones aprendidas, riesgos identificados, recomendaciones
` : `
1. **Resumen ejecutivo**: Párrafo de 3-4 líneas resumiendo el avance del bloque
2. **Métricas de avance**:
   - Horas consumidas hasta la fecha: ${totalHours}h
   - Casos activos: ${totalCases}
   - Distribución por estado
3. **Detalle por caso**: Para cada caso listar:
   - Clave y nombre de la tarea
   - Fecha de creación (campo "created" en formato DD/MM/YYYY)
   - Fecha de cierre: si tiene "resolutionDate" mostrarlo en formato DD/MM/YYYY. Si NO tiene resolutionDate, mostrar "En progreso (última actualización: DD/MM/YYYY)" usando el campo "updated"
   - Horas consumidas hasta ahora
   - Estado actual
   - Resumen de avance
   - Próximos pasos
4. **Riesgos y dependencias**: Alertar sobre posibles riesgos o bloqueos
5. **Proyección para el cierre del bloque**: Qué se espera completar y qué podría quedar pendiente
`}

REGLAS:
- Sé profesional y orientado a resultados
- NO uses lenguaje técnico de Jira (changelog, transición, etc.)
- Usa verbos como "Se implementó", "Se completó", "Se avanzó en"
- Para cada caso, basa el resumen en los datos reales (comentarios, cambios de estado, descripciones)
- Calcula porcentajes de avance cuando sea posible
- Resalta los logros más importantes
- Si un caso tiene 0 horas o muy pocas, menciónalo como tarea minor o de soporte
- Formato de fecha DD/MM/YYYY
- NO inventes información que no esté en los datos

DATOS DE CADA CASO:
${JSON.stringify(casesData, null, 2)}

Genera el reporte ${isClosing ? 'de cierre' : 'de avance'} ahora:`;

  const result = await model.generateContent(prompt);
  const response = result.response;
  return response.text();
}

async function formatText(text, context = 'general') {
  if (!model) {
    if (!initGemini()) {
      throw new Error('GEMINI_API_KEY no configurado en .env');
    }
  }

  const contextHints = {
    'ajuste': 'una descripción de un ajuste técnico (bug fix o cambio solicitado) en un proyecto web',
    'resumen': 'un resumen de cambios implementados en un sprint/entrega de desarrollo',
    'problema': 'la descripción de un problema/bug detectado en producción',
    'despliegue': 'notas para un despliegue a producción (deploy notes)',
    'revision': 'notas de revisión de un requerimiento técnico con estimación de esfuerzo',
    'pr': 'una descripción de los cambios realizados en un Pull Request',
    'contentful': 'una descripción de cambios realizados en el CMS Contentful',
    'general': 'documentación técnica de un proyecto web',
  };

  const hint = contextHints[context] || contextHints.general;

  const prompt = `Eres un asistente de documentación técnica. Tu tarea es tomar el texto del usuario y REORGANIZARLO de forma clara, profesional y bien estructurada. El texto es ${hint}.

REGLAS ESTRICTAS:
- NO inventes información que no esté en el texto original
- NO elimines información relevante
- Corrige ortografía y gramática
- Organiza en secciones lógicas si el texto es largo
- Usa formato Jira wiki markup:
  * Encabezados: h3. Título, h4. Subtítulo
  * Negritas: *texto*
  * Listas: * item (con asterisco y espacio)
  * Listas numeradas: # item
  * Código inline: {{código}}
- Si el texto ya está bien estructurado, solo mejora la redacción y formato
- Si el texto es corto (1-2 líneas), no lo sobreformateéis, solo mejora la claridad
- Responde ÚNICAMENTE con el texto formateado, sin explicaciones ni preámbulos
- Escribe en español

TEXTO A FORMATEAR:
${text}`;

  const result = await model.generateContent(prompt);
  const response = result.response;
  return response.text();
}

async function reformatCommentForJira(rawText) {
  if (!model) {
    if (!initGemini()) {
      throw new Error('GEMINI_API_KEY no configurado en .env');
    }
  }

  const prompt = `Eres un asistente experto en gestión de proyectos de desarrollo web. Tu tarea es tomar un comentario crudo de Jira y REFORMATEARLO al formato estructurado "SCv2" que usa nuestro equipo.

FORMATO OBJETIVO (Jira Wiki Markup):
El comentario debe comenzar con una línea hidden de tipo: {color:#f4f5f7}[SCv2:<tipo>]{color}
Seguido de: h2. <emoji> <Título del tipo>
Luego: *Fecha:* <fecha del comentario original si se detecta, o la actual>

TIPOS DISPONIBLES (detectar automáticamente basándose en el contenido):
1. "review" (📋 Revisión de solicitud) — si habla de estimados, revisión de requerimientos, horas estimadas
2. "delivery" (🚀 Entrega / Avance) — si menciona PRs, entregas, avances, deploy a develop, cambios implementados
3. "adjustment" (🔧 Ajuste) — si describe un ajuste, corrección o fix a algo ya entregado
4. "production" (🏁 PR a Producción) — si habla de deploy a producción, PR a master/main, paso a prod
5. "warranty" (🛡️ Garantía) — si menciona garantía, re-ajuste post-producción, bug en producción

SECCIONES SEGÚN EL TIPO:

Para "review":
- h3. ⏱ Estimado (si menciona horas)
- h3. 📝 Notas de revisión

Para "delivery" o "adjustment":
- h3. 📝 Resumen / Descripción
- h3. 🔀 Pull Request → {{<branch>}} (si hay URLs de PR)
  - Usar tabla: ||Campo||Valor||
  - |URL|[url|url]|
  - |Branch|{{source}} → {{destination}}|
  - |Estado|<estado>|
- h3. 📦 Cambios en Contentful (si aplica)
- h3. ⏱ Tiempo invertido (si menciona horas)

Para "production":
- h3. 📝 Resumen
- h3. 🔀 Pull Request → {{master}}
- h3. 📦 Cambios en Contentful (master) (si aplica)
- h3. ⏱ Tiempo invertido

Para "warranty":
- h3. 🚨 Problema detectado
- h3. 🔀 PR Corrección (si aplica)

REGLAS DE FORMATO WIKI:
- Encabezados: h2. Título, h3. Subtítulo, h4. Sub-sub
- Negrita: *texto*
- Cursiva: _texto_
- Código inline: {{código}}
- Links: [texto visible|URL]
- Tablas: ||Encabezado1||Encabezado2|| y |valor1|valor2|
- Listas: * item (con asterisco)
- Listas numeradas: # item

REGLAS ESTRICTAS:
- NO inventes información. Solo reorganiza y reformatea lo que ya está.
- Preserva TODAS las URLs, nombres de branch, números de PR, fechas y horas exactas.
- Si el texto tiene URLs de Pull Request, extráelas y ponlas en la tabla de PR.
- Si detectas horas mencionadas, colócalas en la sección de tiempo.
- Mejora la redacción y ortografía sin cambiar el significado.
- Si el comentario es muy corto (1-2 líneas), aún así dale estructura mínima con el tipo detectado.
- Responde ÚNICAMENTE con el texto formateado en wiki markup, sin explicaciones.
- Además, en la PRIMERA línea de tu respuesta, incluye SOLO el tipo detectado entre corchetes, así: [TIPO:review] o [TIPO:delivery], etc. Después el wiki markup.

COMENTARIO A REFORMATEAR:
${rawText}`;

  const result = await model.generateContent(prompt);
  const response = result.response;
  const fullText = response.text().trim();

  // Extract detected type from first line
  const typeMatch = fullText.match(/^\[TIPO:(\w+)\]/);
  const detectedType = typeMatch ? typeMatch[1] : 'delivery';
  const formatted = typeMatch ? fullText.replace(/^\[TIPO:\w+\]\s*/, '') : fullText;

  return { formatted, detectedType };
}

module.exports = { generateActivityReport, generateBlockReport, formatText, reformatCommentForJira, initGemini };
