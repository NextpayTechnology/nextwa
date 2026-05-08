# Upstream Base

Este pacote é um **fork interno** do Baileys. O código foi importado a partir da
release oficial e, a partir deste ponto, **todas as mudanças são nossas**
(documentadas em `PATCHES.md`).

## Versão atualmente baseada

| | |
|---|---|
| **Projeto origem** | [WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys) |
| **Tag / Release**  | `v7.0.0-rc.9` (master sem novas releases tagged desde 2025-11) |
| **Licença**        | MIT (mantida — ver `LICENSE`) |
| **Data do import** | 2026-04-23 |
| **Escopo**         | Código `src/`, `WAProto/`, `proto-extract/`, tsconfigs. |
| **Import anterior** | v6.7.21 @ `15b6247ccf7dabd9d4db9ae055121170881f8ea1` (2026-04-22) |
| **Cherry-picks recentes** | 5 commits do master — ver "Histórico de cherry-picks" abaixo |

## Histórico de cherry-picks (sem re-import completo)

Quando o master Baileys avança sem release tagged, aplicamos cherry-picks
controlados pra absorver bugfixes críticos em vez de re-importar tudo.
Cada cherry-pick vira PATCH-NNN no `PATCHES.md`.

### Round 1 — 2026-05-06 (5 commits absorvidos do master @ 2e421bc97a)

| Commit upstream | Nosso PATCH | Descrição |
|---|---|---|
| `1453b06b` | PATCH-022 | Pin `music-metadata` em 11.12.1+ (TS declarations) |
| `8ca9316a` | PATCH-018 | JID validation em `updateBlockStatus` |
| `798f2a93` | PATCH-019 | Null/undefined hardening (5 arquivos) |
| `0956f51f` | PATCH-020 | App state sync skip undecryptable (parcial) |
| `3730684e` | PATCH-021 | Memory leak cleanup no socket end (9 arquivos) |

**Não aplicados nesta rodada (e por quê):**
- `bd68f1a0` — QR regression em `companion-reg-client-utils.ts`. Não temos o
  arquivo (feature `de80aab1` ainda não absorvida).
- `ac90a2d7` — App state resilience WA Web. Depende de infra ausente
  (`whatsapp-rust-bridge`, helpers como `isMissingKeyError`).

**33 commits do master pulados** porque são features novas que precisariam
re-import completo, ou patches em áreas que já cobrimos via PATCHes 011-017
não documentados (ver `PATCHES.md`).

## O que foi REMOVIDO do upstream no import

Para manter o fork enxuto e focado, removemos assets que não agregam ao nosso uso:

- `.github/` — workflows deles (criamos os nossos separados)
- `Example/` — exemplos em Node que não rodamos
- `Media/` — imagens de documentação
- `CHANGELOG.md` — histórico deles (o nosso começa em `PATCHES.md`)
- `.release-it.yml`, `.yarnrc.yml` — configs de release do projeto deles
- `typedoc.json`, `jest.config.ts`, `engine-requirements.js` — ferramentas não utilizadas
- `yarn.lock` — usamos npm neste monorepo

O **código-fonte e o contrato de API permanecem 100% idênticos ao upstream** no
import inicial. Qualquer alteração posterior vira entrada em `PATCHES.md`.

## Como atualizar quando sair nova versão upstream

**Regra de ouro:** nunca `git pull` de um remote do upstream. Sempre re-import
controlado via diff.

```bash
cd backend/libs/wa-core

# 1. Preservar patches aplicados (lista em PATCHES.md)
git stash

# 2. Baixar nova tarball do upstream
curl -L https://github.com/WhiskeySockets/Baileys/archive/refs/tags/vX.Y.Z.tar.gz \
  | tar -xz --strip-components=1

# 3. Remover metadados deles (igual ao import inicial)
rm -rf .github Example Media CHANGELOG.md .release-it.yml .yarnrc.yml \
       typedoc.json jest.config.ts engine-requirements.js yarn.lock

# 4. Reaplicar nosso package.json (ou diffar e mergear mudanças neles)
#    — garanta que name continua "@impzapp/wa-core"

# 5. Reaplicar patches de PATCHES.md (git stash pop + revisão manual por arquivo)
git stash pop

# 6. Atualizar esta tabela no UPSTREAM.md (Tag, SHA, data)

# 7. Rodar build + suíte e2e antes de mergear na main
npm run build
```

## Política de divergência

- **Preferimos re-implementar nosso patch** se o upstream refatorou a mesma área
  — reduz risco de regressão silenciosa.
- **Evitamos patchar arquivos tocados com frequência pelo upstream**
  (`src/Socket/socket.ts`, `src/Utils/messages.ts`) a menos que necessário.
  Cada patch em área "quente" custa tempo em todo upgrade.
