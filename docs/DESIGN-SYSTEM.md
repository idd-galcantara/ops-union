# ops-union — Design System

## Tokens de cor

```css
:root {
  --ink: #202735;        /* texto/títulos */
  --muted: #7d8799;      /* texto secundário */
  --line: #e3e6eb;       /* bordas e divisores */
  --panel: #fbfbfc;      /* fundo de painéis */
  --canvas: #f5f6f8;     /* fundo da área principal */
  --navy: #334258;       /* ícones grandes / ênfase secundária */

  --accent: #df7045;         /* terracota — cor primária */
  --accent-soft: #fff0ea;    /* fundo suave do accent */
  --accent-hover: #ca5e37;   /* hover de botões primários */

  /* Estados */
  --ok: #5cb78a;         /* saudável / online (verde) */
  --ok-soft: #e4f5ec;
  --warn: #a17b3c;       /* atenção */
  --warn-soft: #fffaf0;
  --error: #bd5d58;      /* erro */
  --error-soft: #fff5f4;
  --info: #6685a4;       /* respostas / informativo (azul) */

  --mono: 'DM Mono', ui-monospace, Consolas, monospace;
  --sans: 'Manrope', system-ui, 'Segoe UI', Roboto, sans-serif;
}
```

## Tipografia

- **Sans:** Manrope (texto e títulos).
- **Mono:** DM Mono (eyebrows, badges, metadados, valores técnicos — normalmente `9-10px`, uppercase, `letter-spacing` leve).
- Base do corpo: `#202735` sobre `#f3f4f6`.

## Componentes base ()

- **topbar**: altura 66px, fundo branco, `border-bottom: 1px solid var(--line)`.
- **brand-lockup**: `brand-mark` quadrado 31px (`background: var(--ink)`, ícone branco, `border-radius: 8px`) + nome do produto.
- **primary-button**: `background: var(--accent)`, texto branco, sombra suave `0 3px 7px rgba(223,112,69,.22)`; hover `--accent-hover`.
- **secondary-button**: fundo branco, `border: 1px solid var(--line)`, texto `#647084`.
- **icon-button**: 32px, hover com fundo `#eef0f3`; variação `.accent` usa `--accent-soft`.
- **eyebrow**: rótulo pequeno em `var(--mono)`, uppercase, `color: #a2aab6`.
- **cards**: fundo branco/painel, `border: 1px solid var(--line)`, `border-radius: 6-8px`, sombra sutil.
- **badges de status**: pílulas em `var(--mono)` com as cores de estado (ok/warn/error/info).
- **live-badge**: pílula verde com ponto pulsante para indicar dado ao vivo (útil para o refresh de pods/logs).

## Aplicação no ops-union

- **Coluna Cluster / Namespace**: usar `var(--mono)` para o nome do cluster (dado técnico).
- **Status de pod**: mapear para as cores de estado — Running → `--ok`, Pending/warning → `--warn`, CrashLoopBackOff/Error → `--error`.
- **Erros por alvo (target)**: banner com `--error-soft` / borda `--error`, sem esconder os resultados válidos.
- **Logs ao vivo**: `live-badge` verde enquanto o WebSocket está em follow.
- **Ícones**: biblioteca `lucide-react`
