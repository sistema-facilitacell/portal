/**
 * ATLAS RH — TESTES DAS FUNÇÕES DE CÁLCULO
 * ─────────────────────────────────────────────────────────────────────────
 * Como usar:
 *   1. Coloque este arquivo na mesma pasta do index_rh_v6_pwa.html
 *   2. No terminal:  node atlas_testes.js
 *
 * O script abre o HTML, recorta as funções de cálculo e roda cada uma
 * contra valores conferidos na mão. Rode depois de qualquer alteração
 * em INSS, IRRF, rescisão, RPA ou regime — se algum número mudar sem
 * você querer, o teste acusa antes de ir para produção.
 */

const fs = require('fs');
const ARQUIVO = process.argv[2] || 'index_rh_v6_pwa.html';

let html;
try { html = fs.readFileSync(ARQUIVO, 'utf8'); }
catch (e) { console.error('❌ Não encontrei ' + ARQUIVO + '. Passe o caminho: node atlas_testes.js caminho/arquivo.html'); process.exit(1); }

// ── Recorta um trecho do HTML entre dois marcadores ───────────────────────
function recortar(de, ate) {
  const i = html.indexOf(de);
  const j = html.indexOf(ate, i + 1);
  if (i < 0 || j < 0) throw new Error('Não achei o trecho: ' + de);
  return html.slice(i, j);
}

// ── Ambiente mínimo ───────────────────────────────────────────────────────
global.window = global;
global.APP = { ferias: [], employees: [], contratos: [], contratosPJ: [], rpas: [], assinaturas: [] };
global.toast = () => {};
global.esc = s => String(s || '');

let passou = 0, falhou = 0;
function conferir(nome, obtido, esperado, tolerancia) {
  const tol = tolerancia === undefined ? 0.01 : tolerancia;
  const ok = (typeof esperado === 'number')
    ? Math.abs(obtido - esperado) <= tol
    : obtido === esperado;
  if (ok) { passou++; console.log('  ✅ ' + nome); }
  else { falhou++; console.log('  ❌ ' + nome + '\n       esperado: ' + esperado + '\n       obtido:   ' + obtido); }
}
function secao(t) { console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 60 - t.length))); }

// ── Carrega as funções ────────────────────────────────────────────────────
eval(recortar('const INSS_FAIXAS_2026', 'function _escHtml'));                  // INSS + IRRF
eval(recortar('const TIPOS_RESCISAO', 'function abrirCalcRescisao'));         // rescisão
eval(recortar('const ATLAS_INSS_TETO_AUT', 'function _atlasTermoEncerramento')); // RPA
eval(recortar('const ATLAS_REGIMES', 'window.atlasBadgeRegime'));             // regime

// ═══════════════════════════════════════════════════════════════════════════
secao('INSS 2026 — progressivo, teto R$ 8.475,55');
conferir('1.518,00 → faixa 1 (7,5%)', calcINSS(1518), 113.85);
conferir('2.500,00 → duas faixas', calcINSS(2500), 200.69);
conferir('3.000,00 → três faixas', calcINSS(3000), 248.60);
conferir('acima do teto trava', calcINSS(20000), calcINSS(8475.55));
conferir('zero não gera desconto', calcINSS(0), 0);

secao('Rescisão — término de experiência no prazo');
{
  const emp = { id: 'e1', nome: 'T', dataAdmissao: '2026-06-01', salario: 1518 };
  const r = calcularRescisao({ emp, tipo: 'fim_experiencia', dataRescisao: '2026-08-29', salario: 1518 });
  const v = d => (r.verbas.find(x => x.desc.indexOf(d) === 0) || {}).valor;
  conferir('saldo usa dias reais do mês (29/31)', v('Saldo de salário'), 1420.06);
  conferir('13º proporcional 3/12', v('13º salário proporcional'), 379.50);
  conferir('férias proporcionais + 1/3', v('Férias proporcionais'), 506.00);
  conferir('sem multa de 40%', r.tipo.multaFgts, 0);
  conferir('sem aviso prévio', r.tipo.aviso, 'nenhum');
  conferir('sem seguro-desemprego', r.tipo.seguroDesemprego, false);
}

secao('Rescisão — dispensa antecipada na experiência (art. 479)');
{
  const emp = { id: 'e1', nome: 'T', dataAdmissao: '2026-07-01', salario: 3000 };
  const r = calcularRescisao({ emp, tipo: 'exp_antecipada_empregador', dataRescisao: '2026-08-12',
                               salario: 3000, fimContrato: '2026-09-29' });
  const ind = (r.verbas.find(x => /art\. 479/.test(x.desc)) || {}).valor;
  conferir('metade dos 48 dias restantes', ind, 2400.00);
  conferir('multa de 40% é devida', r.tipo.multaFgts, 0.40);
  conferir('sem data de término não zera calado', /informe o término/i.test(
    (calcularRescisao({ emp, tipo: 'exp_antecipada_empregador', dataRescisao: '2026-08-12', salario: 3000 })
      .verbas.find(x => /art\. 479/.test(x.desc)) || {}).desc || ''), true);
}

secao('Rescisão — dispensa sem justa causa, 2 anos de casa');
{
  const emp = { id: 'e2', nome: 'T', dataAdmissao: '2024-03-10', salario: 2500 };
  APP.ferias = [];
  const r = calcularRescisao({ emp, tipo: 'sem_justa_causa', dataRescisao: '2026-08-13', salario: 2500 });
  conferir('aviso de 30 + 3/ano = 36 dias', r.diasAviso, 36);
  conferir('férias em dobro quando nada foi gozado',
    r.verbas.some(x => /dobro/i.test(x.desc)), true);

  APP.ferias = [{ empId: 'e2', status: 'gozado' }, { empId: 'e2', status: 'gozado' }];
  const r2 = calcularRescisao({ emp, tipo: 'sem_justa_causa', dataRescisao: '2026-08-13', salario: 2500 });
  conferir('férias lançadas removem as vencidas',
    r2.verbas.some(x => /férias vencidas/i.test(x.desc)), false);
  conferir('diferença entre os dois cenários', r.liquido - r2.liquido > 9000, true);
  APP.ferias = [];
}

secao('RPA — autônomo pessoa física');
conferir('INSS 11% sobre 1.200', atlasCalcRPA(1200, 0).inss, 132.00);
conferir('líquido de 1.200', atlasCalcRPA(1200, 0).liquido, 1068.00);
conferir('INSS trava no teto', atlasCalcRPA(20000, 0).inss, 932.31);
conferir('ISS de 2% sobre 3.000', atlasCalcRPA(3000, 2).iss, 60.00);
conferir('patronal 20% não sai do prestador', atlasCalcRPA(1000, 0).patronal, 200.00);
{
  const sem = atlasCalcRPA(968.33, 0, true);
  conferir('sem retenção: líquido = bruto', sem.liquido, sem.bruto);
  conferir('sem retenção: INSS zerado', sem.inss, 0);
  conferir('sem retenção: patronal continua', sem.patronal, 193.67);
}
{
  // Caso real conferido na mão: 10 dias de 2.500 + 9 aparelhos × 15
  const bruto = +((2500 / 30) * 10).toFixed(2) + 9 * 15;
  const r = atlasCalcRPA(bruto, 0);
  conferir('composição proporcional + comissão', r.bruto, 968.33);
  conferir('líquido do caso real', r.liquido, 861.81);
}

secao('Regime de contratação');
APP.contratos = [{ tipo: 'INTERMITENTE', empCpf: '11111111111' }, { tipo: 'PJ', empCpf: '22222222222' }];
conferir('explícito manda', atlasRegime({ regime: 'autonomo', cpf: '11111111111' }), 'autonomo');
conferir('infere intermitente pelo contrato', atlasRegime({ cpf: '11111111111' }), 'intermitente');
conferir('infere PJ pelo contrato', atlasRegime({ cpf: '22222222222' }), 'pj');
conferir('sem informação assume CLT', atlasRegime({ cpf: '99999999999' }), 'clt');
conferir('regime inválido cai na inferência', atlasRegime({ regime: 'xpto', cpf: '11111111111' }), 'intermitente');
conferir('autônomo não tem vínculo', atlasRegimeInfo({regime:'autonomo'}).vinculo, false);
conferir('intermitente tem vínculo', atlasRegimeInfo({regime:'intermitente'}).vinculo, true);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(64));
console.log(falhou === 0
  ? `✅ TUDO CERTO — ${passou} verificações passaram.`
  : `❌ ${falhou} FALHA(S) de ${passou + falhou} verificações. Confira antes de publicar.`);
console.log('═'.repeat(64));
process.exit(falhou === 0 ? 0 : 1);
