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

module.exports = { generateActivityReport, generateBlockReport, initGemini };
