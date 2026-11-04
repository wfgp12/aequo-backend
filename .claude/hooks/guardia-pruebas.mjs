#!/usr/bin/env node
// Guardia de carriles entre el agente tester y el resto (arquitecto e implementador).
//
// - El subagente "tester" solo puede escribir pruebas y criterios de aceptación, y solo
//   dentro de su worktree (la carpeta del repo cuyo nombre termina en "-tester").
// - Cualquier otro agente (el arquitecto, el implementador) no puede tocar pruebas ni
//   criterios, ni escribir nada dentro del worktree del tester.
// - Es tester el subagente llamado "tester" o una sesión de terminal con AEQUO_ROL=tester.
//   Ver CLAUDE.md.
//
// La carpeta que manda es la del archivo que se escribe (se busca su repo con ".git"), no la
// de la sesión: el arquitecto vive en la carpeta principal y lanza al tester sobre el worktree.
//
// Claude Code ejecuta este script antes de cada Edit/Write/MultiEdit/NotebookEdit
// (ver .claude/settings.json). Salir con código 2 bloquea la herramienta y le
// devuelve el mensaje de stderr al agente.
//
// Ojo: no cubre archivos escritos desde Bash (echo, sed...). Esa vía la cierra
// el job "pruebas-protegidas" del CI, que revisa cada commit del PR.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Rutas protegidas de ESTE repositorio (relativas a la raíz, con "/").
const PROTEGIDAS = [
  /\.spec\.ts$/, // pruebas unitarias e de integración junto al código
  /^test\//, // pruebas e2e
  /^criterios\/[^_]/, // criterios de aceptación (la plantilla _plantilla.md queda libre)
];

const AGENTE_TESTER = 'tester';

// Sube desde el archivo hasta la carpeta con ".git" (en un worktree es un archivo); si no
// hay ninguna, usa la raíz de la sesión.
function raizDelRepo(archivo, respaldo) {
  let carpeta = path.dirname(archivo);
  for (;;) {
    if (existsSync(path.join(carpeta, '.git'))) return carpeta;
    const padre = path.dirname(carpeta);
    if (padre === carpeta) return respaldo;
    carpeta = padre;
  }
}

const entrada = JSON.parse(readFileSync(0, 'utf8'));
const sesion = path.resolve(process.env.CLAUDE_PROJECT_DIR || entrada.cwd || process.cwd());
const destino = entrada.tool_input?.file_path ?? entrada.tool_input?.notebook_path;

if (!destino) process.exit(0);

const archivo = path.resolve(sesion, destino);
const raiz = raizDelRepo(archivo, sesion);
const relativa = path.relative(raiz, archivo).split(path.sep).join('/');
const esTester = entrada.agent_type === AGENTE_TESTER || process.env.AEQUO_ROL === AGENTE_TESTER;

function bloquear(mensaje) {
  console.error(`Bloqueado: ${mensaje}`);
  process.exit(2);
}

if (relativa.startsWith('..')) {
  // Fuera de cualquier repo (por ejemplo ../coordinacion): solo el tester no puede escribir ahí.
  if (esTester) bloquear('el agente tester solo escribe pruebas y criterios dentro de su worktree.');
  process.exit(0);
}

const esProtegida = PROTEGIDAS.some((patron) => patron.test(relativa));
const enWorktreeTester = path.basename(raiz).endsWith(`-${AGENTE_TESTER}`);

if (esTester && !enWorktreeTester) {
  bloquear(
    `el agente tester solo escribe en su worktree (${path.basename(raiz)} no lo es). ` +
      'Escribe con la ruta absoluta del worktree que te dio el arquitecto.',
  );
}

if (esTester && !esProtegida) {
  bloquear(
    `el agente tester solo escribe pruebas y criterios de aceptación, no "${relativa}". ` +
      'Si la prueba necesita código nuevo, déjala en rojo y descríbelo en tu reporte.',
  );
}

if (!esTester && enWorktreeTester) {
  bloquear(
    `"${relativa}" está en el worktree del tester (${path.basename(raiz)}), donde solo escribe ` +
      'el agente tester. Si hace falta algo ahí, pídeselo al arquitecto.',
  );
}

if (!esTester && esProtegida) {
  bloquear(
    `"${relativa}" es una prueba o un criterio de aceptación y solo lo modifica el agente tester. ` +
      'Implementa hasta que las pruebas pasen. Si crees que una prueba está mal, detente y explica por qué; ' +
      'el desarrollador decide si se la pasa al tester.',
  );
}

process.exit(0);
