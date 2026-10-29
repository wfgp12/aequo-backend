#!/usr/bin/env node
// Guardia de carriles entre el agente tester y el agente que implementa.
//
// - El agente "tester" solo puede escribir pruebas y criterios de aceptación. Es tester:
//   el subagente llamado "tester", una sesión abierta en el worktree cuya carpeta
//   termina en "-tester" (así se usa desde Claude Code desktop) o una sesión de
//   terminal con AEQUO_ROL=tester. Ver CLAUDE.md.
// - Cualquier otro agente (la sesión principal, que implementa) no puede tocarlos.
//
// Claude Code ejecuta este script antes de cada Edit/Write/MultiEdit/NotebookEdit
// (ver .claude/settings.json). Salir con código 2 bloquea la herramienta y le
// devuelve el mensaje de stderr al agente.
//
// Ojo: no cubre archivos escritos desde Bash (echo, sed...). Esa vía la cierra
// el job "pruebas-protegidas" del CI, que revisa cada commit del PR.

import { readFileSync } from 'node:fs';
import path from 'node:path';

// Rutas protegidas de ESTE repositorio (relativas a la raíz, con "/").
const PROTEGIDAS = [
  /\.spec\.ts$/, // pruebas unitarias e de integración junto al código
  /^test\//, // pruebas e2e
  /^criterios\/[^_]/, // criterios de aceptación (la plantilla _plantilla.md queda libre)
];

const AGENTE_TESTER = 'tester';

const entrada = JSON.parse(readFileSync(0, 'utf8'));
const raiz = process.env.CLAUDE_PROJECT_DIR || entrada.cwd || process.cwd();
const destino = entrada.tool_input?.file_path ?? entrada.tool_input?.notebook_path;

if (!destino) process.exit(0);

const relativa = path.relative(raiz, path.resolve(raiz, destino)).split(path.sep).join('/');
if (relativa.startsWith('..')) process.exit(0); // fuera del repo: no es asunto de esta guardia

const esProtegida = PROTEGIDAS.some((patron) => patron.test(relativa));
const esCarpetaTester = path.basename(path.resolve(raiz)).endsWith(`-${AGENTE_TESTER}`);
const esTester =
  entrada.agent_type === AGENTE_TESTER || process.env.AEQUO_ROL === AGENTE_TESTER || esCarpetaTester;

if (esTester && !esProtegida) {
  console.error(
    `Bloqueado: el agente tester solo escribe pruebas y criterios de aceptación, no "${relativa}". ` +
      'Si la prueba necesita código nuevo, déjala en rojo y descríbelo en tu reporte.',
  );
  process.exit(2);
}

if (!esTester && esProtegida) {
  console.error(
    `Bloqueado: "${relativa}" es una prueba o un criterio de aceptación y solo lo modifica el agente tester. ` +
      'Implementa hasta que las pruebas pasen. Si crees que una prueba está mal, detente y explica por qué; ' +
      'el desarrollador decide si se la pasa al tester.',
  );
  process.exit(2);
}

process.exit(0);
