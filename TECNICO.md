# 🔧 Documentación Técnica - Heatmap de Liquidez

## Índice
1. [Arquitectura](#arquitectura)
2. [Componentes](#componentes)
3. [Flujo de Datos](#flujo-de-datos)
4. [API de Funciones](#api-de-funciones)
5. [Sistemas de Color](#sistemas-de-color)
6. [Optimizaciones](#optimizaciones)
7. [Extensiones Posibles](#extensiones-posibles)

---

## Arquitectura

### Estructura General
```
┌─────────────────────────────────────────────┐
│           HTML (DOM Structure)              │
│  ├─ Header (controles)                      │
│  ├─ Main (gráfico + canvas overlay)         │
│  └─ Liquidity Panel (sidebar)               │
└─────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────┐
│       Lightweight Charts Library            │
│  ├─ Candlestick Series (precios)            │
│  ├─ Volume Series (volumen)                 │
│  ├─ Open Interest Series (OI)               │
│  ├─ Liquidation Series (longs/shorts)       │
│  ├─ OI/Vol Ratio Series                     │
│  └─ Heatmap Series (150 líneas)             │
└─────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────┐
│    Canvas Overlay (renderizado custom)      │
│  ├─ Render Histórico (blur)                 │
│  └─ Render Activo (clara)                   │
└─────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────┐
│         Liquidity Panel (Sidebar)           │
│  ├─ Zona Items (x15 máx)                    │
│  └─ Scroll Container                        │
└─────────────────────────────────────────────┘
```

---

## Componentes

### 1. Canvas Overlay
**Archivo**: `index.html` (línea ~260)

```javascript
const heatmapOverlayCanvas = document.createElement('canvas');
heatmapOverlayCanvas.id = 'liquidity-heatmap-overlay';
heatmapOverlayCanvas.style.position = 'absolute';
heatmapOverlayCanvas.style.pointerEvents = 'none';
heatmapOverlayCanvas.style.zIndex = '20';
```

**Responsabilidades**:
- Renderizar zonas de liquidez
- Aplicar gradientes y efectos
- Clip a zona de precio del gráfico

### 2. Panel Lateral (Liquidity Panel)
**Archivo**: `index.html` (líneas ~152-158)

**Estructura HTML**:
```html
<div id="liquidity-panel" class="liquidity-panel">
    <div> <!-- Header --> </div>
    <div id="liquidity-zones-container"></div>
</div>
```

**Estados**:
- `.active` - Panel visible
- Por defecto - Panel oculto

### 3. Botón Toggle
**Archivo**: `index.html` (líneas ~147-150)

**Funcionalidad**:
- Toggle panel con click
- Ícono SVG que rota
- Indicador visual de estado

---

## Flujo de Datos

### Ciclo de Actualización Completo

```
1. updateChartData()
   │
   ├─ fetchKlines() → Array de velas
   ├─ fetchOpenInterest() → Array de OI
   └─ fetchLiquidations() → Array de liquidaciones
   
   ↓
   
2. renderAllVisuals()
   │
   ├─ Procesar liquidaciones por tipo (long/short)
   ├─ Calcular ratio OI/Vol
   └─ Llamar drawAllLiquidationZones()
   
   ↓
   
3. drawAllLiquidationZones()
   │
   ├─ calculateAndDrawActiveZones()
   │  ├─ Calcular liquidación pools con blur kernel
   │  ├─ Filtrar por threshold
   │  ├─ Agrupar en clusters
   │  └─ Guardar en latestHeatmapClusters
   │
   ├─ findAndDrawHistoricalZones()
   │  ├─ Filtrar liquidaciones significativas
   │  ├─ Crear líneas de precio
   │  └─ Guardar en historicalLiquidityZones
   │
   └─ drawOverlayClusters()
      ├─ Renderizar históricas
      └─ Renderizar activas
   
   ↓
   
4. updateLiquidityPanel()
   │
   ├─ Recolectar todas las zonas
   ├─ Ordenar por valor DESC
   ├─ Limitar a 15 zonas
   └─ Renderizar HTML dinámicamente
```

### Ciclo de Renderizado Canvas

```
drawOverlayClusters() (llamada cada frame)
  ↓
requestAnimationFrame()
  ↓
render()
  ├─ Limpiar canvas
  ├─ Setup clipping rect
  ├─ Renderizar históricas (blur 2px)
  ├─ Renderizar activas (sin blur)
  └─ Restaurar estado
```

---

## API de Funciones

### Públicas (Main Functions)

#### `updateChartData()`
```javascript
// Obtiene datos de APIs externas
// Maneja errores automáticamente
// Actualiza UI con loading state

Entrada: global state
Salida: fetchedData actualizado + renderizado
Errores: Muestra overlay de error
Llamado por: Init + intervalo 30s
```

#### `renderAllVisuals()`
```javascript
// Renderiza todas las series de datos

Entrada: fetchedData (klines, OI, liquidations)
Salida: Gráfico completo actualizado
Dependencias: drawAllLiquidationZones()
```

#### `drawAllLiquidationZones(klines, leverages, oiVolRatioData)`
```javascript
// Dibuja zonas activas e históricas

Parametros:
  - klines: Array de velas
  - leverages: Array de leverage seleccionados
  - oiVolRatioData: Array de ratios

Salida: 
  - Actualiza latestHeatmapClusters
  - Actualiza historicalLiquidityZones
  - Llama drawOverlayClusters()
```

#### `drawOverlayClusters()`
```javascript
// Renderiza canvas overlay con heatmap

Entrada: latestHeatmapClusters + historicalLiquidityZones
Salida: Canvas actualizado
Timing: RequestAnimationFrame
```

#### `updateLiquidityPanel()`
```javascript
// Actualiza panel lateral con zonas

Entrada: latestHeatmapClusters + historicalLiquidityZones
Salida: HTML dinámicamente renderizado en liquidity-zones-container
Lógica:
  1. Recolectar todas las zonas
  2. Ordenar por valor desc
  3. Limitar a 15
  4. Generar HTML
```

### Privadas (Helper Functions)

#### `calculateAndDrawActiveZones(klines, leverages, oiVolRatioData)`
```javascript
// Calcula zonas futuras basadas en leverage

Proceso:
1. Crear liquidationPools Map
2. Para cada leverage y kline:
   - Calcular precio de liquidación (long/short)
   - Aplicar blur kernel
   - Acumular en poolsArray
3. Filtrar por threshold
4. Agrupar en clusters por distancia
5. Guardar en heatmapLongSeries/heatmapShortSeries
```

#### `findAndDrawHistoricalZones(klines, longLiqs, shortLiqs)`
```javascript
// Encuentra zonas pasadas significativas

Proceso:
1. Filtrar liquidaciones > 2x promedio
2. Ordenar por volumen
3. Máximo 7 zonas
4. Crear líneas de precio
5. Guardar en historicalLiquidityZones
```

#### `normalizeIntensity(value)`
```javascript
// Normaliza valor a rango 0-1

Input: valor absoluto
Output: valor entre 0 y 1
Fórmula: min(1, max(0, value / maxHeatmapValue))
```

#### `interpolateColor(stops, t)`
```javascript
// Interpola color entre stops

Parametros:
  - stops: Array de {stop: 0-1, color: [r,g,b]}
  - t: valor normalizado 0-1

Output: color interpolado [r, g, b]

Ejemplo:
  stops = [
    {stop: 0, color: [0, 0, 0]},
    {stop: 1, color: [255, 0, 0]}
  ]
  interpolateColor(stops, 0.5) → [127, 0, 0]
```

#### `heatmapColorForValue(value, stops)`
```javascript
// Genera color RGBA para canvas

Proceso:
1. Interpolar color RGB
2. Calcular opacidad (0.15 + eased * 0.35)
3. Retornar "rgba(r, g, b, a)"

Alpha range: 0.15 a 0.50
```

---

## Sistemas de Color

### Paletas Definidas

#### 1. HEATMAP_COLOR_STOPS_LONG
```javascript
[
    { stop: 0.0, color: [15, 23, 42] },        // Oscuro
    { stop: 0.3, color: [34, 197, 94] },       // Verde claro (#22c55e)
    { stop: 0.6, color: [16, 185, 129] },      // Verde medio (#10b981)
    { stop: 1.0, color: [5, 150, 105] }        // Verde oscuro (#059669)
]
```

**Uso**: Zonas de liquidación de LONGS activas

#### 2. HEATMAP_COLOR_STOPS_SHORT
```javascript
[
    { stop: 0.0, color: [15, 23, 42] },        // Oscuro
    { stop: 0.3, color: [239, 68, 68] },       // Rojo claro (#ef4444)
    { stop: 0.6, color: [220, 38, 38] },       // Rojo medio (#dc2626)
    { stop: 1.0, color: [153, 27, 27] }        // Rojo oscuro (#991b1b)
]
```

**Uso**: Zonas de liquidación de SHORTS activas

#### 3. HEATMAP_COLOR_STOPS_HISTORICAL
```javascript
[
    { stop: 0.0, color: [15, 23, 42] },        // Oscuro
    { stop: 0.3, color: [56, 189, 248] },      // Cian (#38bdf8)
    { stop: 0.6, color: [129, 140, 248] },     // Índigo (#818cf8)
    { stop: 1.0, color: [244, 114, 182] }      // Rosa (#f472b6)
]
```

**Uso**: Zonas históricas (60% opacidad)

### Cálculo de Opacidad

```javascript
// Para cada zona:
intensity = normalizeIntensity(zone.value)
eased = pow(intensity, 0.35)  // boost small values

// En canvas:
alpha = 0.15 + eased * 0.35   // 0.15 a 0.50

// Para históricas (multiplicador):
alpha *= 0.6  // Reduce a 0.09 a 0.30
```

### Bordes y Estilos Canvas

```javascript
// Borde exterior:
strokeStyle = side === 'long' 
    ? `rgba(34, 197, 94, ${0.5 + intensity * 0.5})`  // 0.5-1.0 alpha
    : `rgba(239, 68, 68, ${0.5 + intensity * 0.5})`
lineWidth = (1.2 + intensity * 1.2) * dpr  // 1.2-2.4px

// Borde interior (profundidad):
strokeStyle = `rgba(255, 255, 255, ${0.1 * intensity})`
lineWidth = 0.5 * dpr
```

---

## Optimizaciones

### 1. Canvas Clipping
```javascript
ctx.save();
ctx.beginPath();
ctx.rect(0, paneTop, width, height);
ctx.clip();
// renderizar...
ctx.restore();
```
**Beneficio**: No renderiza fuera de zona visible

### 2. RequestAnimationFrame
```javascript
let framePending = false;
const schedule = requestAnimationFrame || setTimeout;

return () => {
    if (framePending) return;  // Skip si ya hay pending
    framePending = true;
    schedule(() => {
        framePending = false;
        render();
    });
};
```
**Beneficio**: Máximo 60fps, evita saturación

### 3. DPI Awareness
```javascript
const dpr = window.devicePixelRatio || 1;
heatmapOverlayCanvas.width = width * dpr;
heatmapOverlayCanvas.height = height * dpr;
heatmapOverlayCanvas.style.width = `${width}px`;
heatmapOverlayCanvas.style.height = `${height}px`;
```
**Beneficio**: Sharp en retina displays

### 4. Límites de Zonas
```javascript
const MAX_HEATMAP_SERIES = 150         // Series en chart
const MAX_PANEL_ZONES = 15             // Items en panel
const MAX_CLUSTERS_PER_SIDE = 25       // Clusters renderizados
const MAX_HISTORICAL_ZONES = 7         // Históricas dibujadas
```
**Beneficio**: Evita memory leaks y lag

### 5. Normalización Inteligente
```javascript
// En lugar de valores absolutos:
intensity = value / maxHeatmapValue

// Con easing para mejor contraste:
eased = pow(normalized, 0.35)

// Resultado: pequeños valores más visibles
```
**Beneficio**: Mejor visualización de todas las zonas

---

## State Management

### Variables Globales Principales

```javascript
// Datos
let fetchedData = { 
    klines: [],
    openInterest: [],
    liquidations: [],
    longLiqs: [],
    shortLiqs: []
};

// Configuración UI
let currentSymbol = 'BTCUSDT';
let currentInterval = '4h';
let selectedLeverages = [50];
let liquidityThresholdPct = 0;
let currentTheme = 'dark';

// Estado de zonas
let latestHeatmapClusters = { long: [], short: [] };
let historicalLiquidityZones = [];

// UI state
let isUpdating = false;
let isDrawingMode = false;
let shouldAutoFitOnNextRender = true;
let userHasCustomTimeScale = false;
```

### Sincronización de Estado

```javascript
// Cuando cambia config:
symbolSelector → updateChartData()
intervalBtn → updateChartData()
leverageBtn → renderAllVisuals()
liquiditySlider → renderAllVisuals()

// Cuando cambian datos:
updateChartData() → renderAllVisuals()
  → drawAllLiquidationZones()
    → drawOverlayClusters()
    → updateLiquidityPanel()
```

---

## Extensiones Posibles

### 1. Agregar Nueva Paleta de Color
```javascript
const HEATMAP_COLOR_STOPS_CUSTOM = [
    { stop: 0.0, color: [r1, g1, b1] },
    { stop: 0.33, color: [r2, g2, b2] },
    { stop: 0.66, color: [r3, g3, b3] },
    { stop: 1.0, color: [r4, g4, b4] }
];

// Usar en drawHeatmapBlock():
const palette = customCondition 
    ? HEATMAP_COLOR_STOPS_CUSTOM 
    : defaultPalette;
```

### 2. Agregar Nuevas Series de Datos
```javascript
// En initializeChart():
const mySeries = chart.addLineSeries({
    color: '#2962FF',
    priceScaleId: 'custom'
});

// En renderAllVisuals():
mySeries.setData(processedData);

// En applyTheme():
mySeries.applyOptions(themeOptions.mySeries);
```

### 3. Agregar Indicador Visual
```javascript
// En drawOverlayClusters():
const drawIndicator = (x, y, size, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, 2 * Math.PI);
    ctx.fill();
};

// Llamar en el loop de renderizado
```

### 4. Agregar Alert al Acercarse a Zona
```javascript
const checkProximity = (price, threshold) => {
    latestHeatmapClusters.long.forEach(cluster => {
        if (Math.abs(price - cluster.centerPrice) < threshold) {
            triggerAlert('Long zone approaching!');
        }
    });
};
```

### 5. Exportar Datos a JSON
```javascript
const exportData = () => {
    const data = {
        timestamp: Date.now(),
        symbol: currentSymbol,
        interval: currentInterval,
        clusters: latestHeatmapClusters,
        historical: historicalLiquidityZones
    };
    return JSON.stringify(data, null, 2);
};
```

---

## Debugging

### Logs Útiles
```javascript
console.log('Klines:', fetchedData.klines.length);
console.log('Clusters Long:', latestHeatmapClusters.long.length);
console.log('Clusters Short:', latestHeatmapClusters.short.length);
console.log('Max Liquidity:', maxLiquidityObserved);
console.log('Panel Zones:', liquidityZonesContainer.children.length);
```

### Modo Debug
```javascript
// Agregar en drawOverlayClusters():
if (window.DEBUG_HEATMAP) {
    console.log('Rendering históricas:', historicalLiquidityZones.length);
    console.log('Rendering activas longs:', latestHeatmapClusters.long.length);
    console.log('Rendering activas shorts:', latestHeatmapClusters.short.length);
}

// Activar en console:
window.DEBUG_HEATMAP = true;
```

### Performance Profiling
```javascript
// Medir tiempo de actualización:
const start = performance.now();
updateChartData();
const end = performance.now();
console.log(`Update took: ${end - start}ms`);
```

---

## Convenciones de Código

### Nombrado
- `heatmap*`: Relacionado a visualización de liquidez
- `liquidity*`: Relacionado a liquidaciones
- `*Series`: Series de Lightweight Charts
- `*Data`: Arrays de datos

### Estructura
```javascript
// 1. DOM Elements
const element = document.getElementById('id');

// 2. Constants
const CONSTANT = 123;

// 3. State
let state = {};

// 4. Initialization
function init() {}

// 5. Main Functions
function update() {}

// 6. Helpers
function helper() {}

// 7. Event Listeners
element.addEventListener('event', () => {});
```

### Comentarios
```javascript
// Sección importante
// ───────────────────

// Explicar por qué, no qué
const result = value ** 0.35;  // Boost contrast on small values
```

---

**Documentación Técnica - Versión 2.0.0**  
**Última actualización: Noviembre 2025**
