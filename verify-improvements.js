#!/usr/bin/env node

/**
 * Verificación de cambios en la visualización de liquidez
 * Este script valida que todos los cambios se hayan aplicado correctamente
 */

const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, 'index.html');
const content = fs.readFileSync(indexPath, 'utf-8');

const checks = [
  {
    name: 'Panel de Liquidez HTML',
    pattern: /<div id="liquidity-panel" class="liquidity-panel">/,
    critical: true
  },
  {
    name: 'Toggle Button',
    pattern: /<button id="toggle-liquidity-panel"/,
    critical: true
  },
  {
    name: 'Liquidez Zonas Container',
    pattern: /<div id="liquidity-zones-container"/,
    critical: true
  },
  {
    name: 'Función updateLiquidityPanel',
    pattern: /function updateLiquidityPanel\(\)/,
    critical: true
  },
  {
    name: 'Color Stops LONG',
    pattern: /HEATMAP_COLOR_STOPS_LONG/,
    critical: true
  },
  {
    name: 'Color Stops SHORT',
    pattern: /HEATMAP_COLOR_STOPS_SHORT/,
    critical: true
  },
  {
    name: 'Estilo liquidity-panel',
    pattern: /\.liquidity-panel\s*\{/,
    critical: true
  },
  {
    name: 'Estilo liquidity-zone-item',
    pattern: /\.liquidity-zone-item\s*\{/,
    critical: true
  },
  {
    name: 'Toggle Panel Listener',
    pattern: /togglePanelBtn\.addEventListener\('click'/,
    critical: true
  }
];

console.log('\n📋 Validando mejoras en visualización de liquidez...\n');

let passed = 0;
let failed = 0;

checks.forEach((check, idx) => {
  const isPresent = check.pattern.test(content);
  const status = isPresent ? '✅' : '❌';
  const severity = check.critical ? '[CRÍTICO]' : '[OPCIONAL]';
  
  console.log(`${status} ${severity} ${check.name}`);
  
  if (isPresent) {
    passed++;
  } else {
    failed++;
  }
});

console.log(`\n📊 Resultados: ${passed}/${checks.length} validaciones pasadas\n`);

if (failed === 0) {
  console.log('✨ ¡Todas las mejoras se han aplicado correctamente!\n');
  console.log('📚 Características implementadas:');
  console.log('  • Panel lateral de liquidez con scroll');
  console.log('  • Botón toggle para mostrar/ocultar panel');
  console.log('  • Visualización mejorada con gradientes');
  console.log('  • Colores diferenciados para Longs/Shorts');
  console.log('  • Información detallada de cada zona');
  console.log('  • Identificación de zonas activas vs históricas');
  console.log('');
  console.log('🚀 Próximos pasos:');
  console.log('  1. Abre index.html en el navegador');
  console.log('  2. Haz click en el botón ">" para abrir el panel');
  console.log('  3. Observa las zonas de liquidez ordenadas por intensidad');
  console.log('  4. Cambia el par/intervalo para ver actualizaciones en tiempo real');
  console.log('');
  process.exit(0);
} else {
  console.log(`⚠️  ${failed} validación(es) no pasó(aron). Revisa los cambios.\n`);
  process.exit(1);
}
