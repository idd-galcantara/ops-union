# Versionamento e release

Este guia descreve como preparar uma versao e publicar uma release do ops-union.

## Como funciona

O workflow `.github/workflows/package-desktop.yml` possui dois comportamentos:

- push na `main`: gera os artifacts de Linux, Windows e macOS para validacao;
- push de uma tag `v*`: gera os mesmos pacotes e cria automaticamente uma GitHub Release.

Na release automatica, o workflow:

1. valida que a tag aponta para um commit da `main`;
2. valida que a versao da tag e igual a versao do `package.json`;
3. baixa e extrai os artifacts dos tres jobs;
4. anexa os arquivos `.deb`, `.AppImage`, `.exe`, `.dmg` e `.zip`;
5. gera release notes com os commits desde a tag anterior;
6. cria a GitHub Release usando o `GITHUB_TOKEN`.

Nao e necessario criar ou publicar a Release manualmente. O `electron-builder` continua usando
`--publish never`; a publicacao e feita pelo proprio workflow depois que os tres builds passam.

Antes do empacotamento, o job `Validate repository` executa `npm ci`, valida as versoes de Node.js
e npm contra `package.json`, verifica a arvore de workspaces, informa dependencias desatualizadas,
executa auditorias de producao e da arvore completa com bloqueio para severidade alta ou critica,
e roda typecheck, testes e build. Os jobs Linux, Windows e macOS so iniciam depois desse gate.
Pull requests que alteram manifests ou o lockfile tambem passam por Dependency Review; Dependabot
acompanha npm e GitHub Actions.

## Versionamento semantico

Escolha o proximo numero conforme o tipo de mudanca:

- `PATCH`: correcao sem nova funcionalidade, por exemplo `0.4.1`;
- `MINOR`: nova funcionalidade compativel, por exemplo `0.5.0`;
- `MAJOR`: mudanca incompatível, por exemplo `1.0.0`.

Confira as tags existentes antes de escolher a versao:

```bash
git fetch --tags
git tag --list 'v*' --sort=-version:refname
```

A tag nao pode ser reutilizada. Se `v0.4.0` ja existir, escolha uma versao posterior.

## Processo completo

Substitua `0.5.0` pela proxima versao escolhida:

```bash
VERSION=0.5.0
```

Atualize `package.json` e `package-lock.json` juntos:

```bash
npm version "$VERSION" --no-git-tag-version
```

Confirme que os tres valores estao alinhados:

```bash
VERSION="$VERSION" node -e "const p=require('./package.json'); const l=require('./package-lock.json'); if (p.version !== process.env.VERSION || l.version !== p.version || l.packages[''].version !== p.version) process.exit(1); console.log('version', p.version)"
```

Execute as validacoes:

```bash
npm ci
npm run validate:toolchain
npm run validate:dependencies
npm audit --omit=dev --audit-level=high
npm audit --audit-level=high
npm run typecheck
npm test --workspace=backend
npm test --workspace=frontend
npm run build
```

Os comandos de validacao devem ser executados com Node.js `26.10.0` e npm `11.6.2`, conforme o
contrato declarado no `package.json`. A workflow fixa explicitamente o npm, pois o runner pode
fornecer uma versao diferente junto do Node.js. Dependencias desatualizadas sao reportadas para manutencao,
mas nao bloqueiam a release por si so; arvore invalida, auditoria alta/critica e falhas de qualidade
bloqueiam.

Revise o diff e crie o commit da versao:

```bash
git diff --check
git diff -- package.json package-lock.json
git add package.json package-lock.json
git commit -m "release: prepare v$VERSION"
git push origin main
```

Somente depois que o commit estiver na `main`, crie e envie a tag:

```bash
git tag -a "v$VERSION" -m "Release v$VERSION"
git push origin "v$VERSION"
```

O segundo push dispara a criacao automatica da release.

## Acompanhar a execucao

Na aba **Actions**, abra a execucao associada a tag `v$VERSION`. Ela deve conter:

- **Package Linux**;
- **Package Windows**;
- **Package macOS**;
- **Create GitHub Release**.

O job `Create GitHub Release` so inicia depois que os tres jobs de empacotamento terminam com
sucesso. A release final deve conter sete arquivos:

```text
ops-union-$VERSION-linux-amd64.deb
ops-union-$VERSION-linux-x86_64.AppImage
ops-union-$VERSION-win-x64.exe
ops-union-$VERSION-mac-arm64.dmg
ops-union-$VERSION-mac-x64.dmg
ops-union-$VERSION-mac-arm64.zip
ops-union-$VERSION-mac-x64.zip
```

O push da `main` e o push da tag geram execucoes separadas. A execucao da `main` serve para
validacao e pode ser cancelada quando a execucao da tag ja estiver em andamento; a execucao da
tag deve permanecer ativa para criar a Release.

## Problemas comuns

### A tag nao corresponde ao package.json

O workflow falha se, por exemplo, `v0.5.0` for enviada enquanto `package.json` ainda estiver em
`0.4.0`. Atualize os dois arquivos com `npm version "$VERSION" --no-git-tag-version`, faça o commit
e envie a `main` antes de criar a tag.

### A tag nao aponta para a main

O workflow aceita somente tags cujo commit esteja no historico da `main`. Nao crie a tag a partir
de uma branch local que ainda nao foi integrada.

### A tag ja foi enviada antes do workflow correto

Nao force a tag sem confirmar que ela ainda nao possui uma Release publicada. Para uma tag criada
por engano e sem Release, remova e recrie somente depois de corrigir o commit:

```bash
git tag -d v0.5.0
git push origin :refs/tags/v0.5.0
git tag -a v0.5.0 -m "Release v0.5.0"
git push origin v0.5.0
```

### O build terminou, mas nao existe Release

Confira se o job `Create GitHub Release` foi executado. Ele depende dos tres jobs de plataforma.
Tambem confirme que a tag usa o formato `v<versao>` e que o workflow possui permissao
`contents: write`.

### Os instaladores mostram avisos de seguranca

Os builds atuais podem nao ter assinatura de codigo ou notarizacao. Isso e independente do
versionamento e da criacao da Release; a distribuicao publica deve configurar os certificados
correspondentes.
