# Upstream Base

Este pacote é um **fork interno** do Baileys. O código foi importado a partir da
release oficial e, a partir deste ponto, **todas as mudanças são nossas**
(documentadas em `PATCHES.md`).

## Versão atualmente baseada

| | |
|---|---|
| **Projeto origem** | [WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys) |
| **Tag / Release**  | `v6.7.21` |
| **Commit SHA**     | `15b6247ccf7dabd9d4db9ae055121170881f8ea1` |
| **Licença**        | MIT (mantida — ver `LICENSE`) |
| **Data do import** | 2026-04-22 |
| **Escopo**         | Código `src/`, `WAProto/`, `proto-extract/`, tsconfigs. |

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
