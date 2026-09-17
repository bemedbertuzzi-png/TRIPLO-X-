#!/usr/bin/env node
/**
 * Agente de impressao do Triplo Xis Lanches.
 *
 * POR QUE ELE EXISTE
 * A aplicacao roda na Vercel, na internet. A Jetway JP-800 esta na loja, numa
 * rede local. A Vercel nao alcanca a impressora e nunca vai alcancar. Quem faz
 * a ponte e este agente: ele roda no computador da loja, busca os cupons na
 * fila e manda para a impressora.
 *
 * Sem este processo rodando, NENHUM pedido e impresso, por mais que o deploy
 * esteja no ar.
 *
 * COMO FUNCIONA
 *  1. a cada POLL_MS consulta GET /api/impressao/fila (bearer IMPRESSAO_TOKEN);
 *  2. o servidor ja marca os itens devolvidos como "processando", entao duas
 *     copias do agente nao imprimem o mesmo pedido;
 *  3. imprime cada cupom;
 *  4. confirma com POST /api/impressao/fila. Em caso de erro, o item volta
 *     para a fila ate 5 tentativas.
 *
 * Uso: node agente.mjs   (configure pelo arquivo .env ao lado ou por ambiente)
 */

import { writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));

// .env simples, sem dependencias
const arquivoEnv = join(AQUI, ".env");
if (existsSync(arquivoEnv)) {
  for (const linha of readFileSync(arquivoEnv, "utf8").split("\n")) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith("#")) continue;
    const igual = limpa.indexOf("=");
    if (igual < 1) continue;
    const chave = limpa.slice(0, igual).trim();
    if (!process.env[chave]) {
      process.env[chave] = limpa.slice(igual + 1).trim();
    }
  }
}

const CONFIG = {
  baseUrl: (process.env.BASE_URL ?? "").replace(/\/$/, ""),
  token: process.env.IMPRESSAO_TOKEN ?? "",
  pollMs: Number(process.env.POLL_MS ?? 5000),
  lote: Number(process.env.LOTE ?? 5),
  // arquivo  -> escreve direto num dispositivo/compartilhamento (ex.: \\.\USB001)
  // comando  -> envia pela entrada padrao de um comando (ex.: lp -d JP800)
  // console  -> so imprime na tela (para testar sem impressora)
  modo: process.env.IMPRESSORA_MODO ?? "console",
  destino: process.env.IMPRESSORA_DESTINO ?? "",
  comando: process.env.IMPRESSORA_COMANDO ?? "",
  larguraColunas: Number(process.env.LARGURA_COLUNAS ?? 48),
};

if (!CONFIG.baseUrl || !CONFIG.token) {
  console.error(
    "Configuracao incompleta: defina BASE_URL e IMPRESSAO_TOKEN em agente-impressao/.env",
  );
  process.exit(1);
}

// ---- ESC/POS -------------------------------------------------------------
const ESC = "\x1b";
const GS = "\x1d";
const INICIALIZAR = `${ESC}@`;
const NEGRITO_ON = `${ESC}E\x01`;
const NEGRITO_OFF = `${ESC}E\x00`;
const CORTAR = `${GS}V\x42\x00`;
const AVANCAR = "\n\n\n";

function montarEscPos(conteudo) {
  const corpo = conteudo
    .split("\n")
    .map((l) => l.slice(0, CONFIG.larguraColunas))
    .join("\n");
  return `${INICIALIZAR}${NEGRITO_ON}${corpo}${NEGRITO_OFF}${AVANCAR}${CORTAR}`;
}

async function enviarParaImpressora(conteudo) {
  const dados = montarEscPos(conteudo);

  if (CONFIG.modo === "console") {
    console.log("\n----- CUPOM (modo console) -----\n" + conteudo);
    return;
  }

  if (CONFIG.modo === "arquivo") {
    if (!CONFIG.destino) throw new Error("IMPRESSORA_DESTINO nao configurado");
    // cp858 cobre os acentos do portugues nas termicas mais comuns
    await writeFile(CONFIG.destino, Buffer.from(dados, "latin1"), { flag: "a" });
    return;
  }

  if (CONFIG.modo === "comando") {
    if (!CONFIG.comando) throw new Error("IMPRESSORA_COMANDO nao configurado");
    await new Promise((resolver, rejeitar) => {
      const partes = CONFIG.comando.split(" ").filter(Boolean);
      const processo = spawn(partes[0], partes.slice(1), { stdio: ["pipe", "ignore", "pipe"] });
      let erro = "";
      processo.stderr?.on("data", (d) => (erro += d.toString()));
      processo.on("error", rejeitar);
      processo.on("close", (codigo) =>
        codigo === 0 ? resolver() : rejeitar(new Error(`comando saiu com ${codigo}: ${erro}`)),
      );
      processo.stdin.end(Buffer.from(dados, "latin1"));
    });
    return;
  }

  throw new Error(`IMPRESSORA_MODO desconhecido: ${CONFIG.modo}`);
}

// ---- comunicacao com a aplicacao ----------------------------------------
async function buscarFila() {
  const r = await fetch(`${CONFIG.baseUrl}/api/impressao/fila?limite=${CONFIG.lote}`, {
    headers: { Authorization: `Bearer ${CONFIG.token}` },
  });
  if (r.status === 401) throw new Error("IMPRESSAO_TOKEN invalido");
  if (!r.ok) throw new Error(`fila respondeu HTTP ${r.status}`);
  const corpo = await r.json();
  return corpo.itens ?? [];
}

async function confirmar(id, ok, erro) {
  await fetch(`${CONFIG.baseUrl}/api/impressao/fila`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CONFIG.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id, ok, erro: erro ? String(erro).slice(0, 500) : undefined }),
  });
}

let parando = false;
process.on("SIGINT", () => {
  console.log("\nEncerrando o agente…");
  parando = true;
});

async function ciclo() {
  const itens = await buscarFila();
  for (const item of itens) {
    try {
      await enviarParaImpressora(item.conteudo);
      await confirmar(item.id, true);
      console.log(`[ok] pedido ${item.numero_publico} impresso`);
    } catch (e) {
      console.error(`[erro] pedido ${item.numero_publico}: ${e.message}`);
      await confirmar(item.id, false, e.message);
    }
  }
}

console.log(
  `Agente de impressao iniciado. Modo=${CONFIG.modo} intervalo=${CONFIG.pollMs}ms`,
);

while (!parando) {
  try {
    await ciclo();
  } catch (e) {
    // rede caiu ou app fora do ar: seguimos tentando, sem derrubar o agente
    console.error(`[falha no ciclo] ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, CONFIG.pollMs));
}
