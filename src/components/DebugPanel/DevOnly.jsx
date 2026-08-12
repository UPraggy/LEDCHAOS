import { Suspense, lazy } from 'react';

/**
 * Porta de entrada do painel de testes — e a única que o resto do app conhece.
 *
 * Existe por um motivo só: fazer o painel DESAPARECER do build de produção.
 *
 * A tentativa ingênua não funciona. Escrever `{import.meta.env.DEV && <DebugPanel/>}`
 * apaga o painel da tela, mas não do arquivo: o `import` lá em cima é estático e
 * incondicional, então o bundler é obrigado a incluir o módulo inteiro — painel,
 * CSS e todos os textos — mesmo sabendo que ninguém vai renderizar. Medido: as
 * strings "PULAR CONTAGEM", "FECHAR DEBUG" e a classe `.dbg__fab` estavam todas
 * dentro do `dist/` de produção.
 *
 * Aqui o import é DINÂMICO e mora dentro de um ramo que o bundler consegue
 * provar que é morto. Em produção `import.meta.env.DEV` vira o literal `false`,
 * o ternário dobra para `null`, e o `import('./index.jsx')` some junto — o chunk
 * nem chega a ser gerado.
 *
 * O preço é o painel entrar um tick depois no `npm run dev`. Para uma ferramenta
 * que fica esperando um gesto secreto, isso é invisível.
 */
const Panel = import.meta.env.DEV ? lazy(() => import('./index.jsx')) : null;

export default function DevOnly() {
  if (!Panel) return null;
  return (
    <Suspense fallback={null}>
      <Panel />
    </Suspense>
  );
}
