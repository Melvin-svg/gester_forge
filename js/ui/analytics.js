/**
 * GestureForge Analytics UI Controller
 * Manages performance dashboards, KPI blocks, line graphs, and metrics tables.
 */
class AnalyticsUIController {
  constructor() {
    this.accuracyKpi = document.getElementById('kpi-accuracy');
    this.latencyKpi = document.getElementById('kpi-latency');
    this.fpKpi = document.getElementById('kpi-fp');
    this.timeKpi = document.getElementById('kpi-time');
    this.comboKpi = document.getElementById('kpi-combo');

    this.distContainer = document.getElementById('gesture-dist-chart');
    this.temporalContainer = document.getElementById('temporal-chart');
    this.metricsBody = document.getElementById('metrics-body');

    this.latencyHistory = Array(30).fill(25);
    this.gestureCounts = {
      'Fist': 0,
      'Open Palm': 0,
      'Pinch': 0,
      'Circle': 0,
      'Swipe': 0,
      'Jump': 0
    };

    this.initCanvases();
    this.resizeCanvases();
    this.populateTable();
  }

  initCanvases() {
    if (this.distContainer) {
      this.distContainer.innerHTML = '<canvas id="chart-dist-canvas"></canvas>';
      this.distCanvas = document.getElementById('chart-dist-canvas');
      this.distCtx = this.distCanvas.getContext('2d');
    }
    if (this.temporalContainer) {
      this.temporalContainer.innerHTML = '<canvas id="chart-temp-canvas"></canvas>';
      this.tempCanvas = document.getElementById('chart-temp-canvas');
      this.tempCtx = this.tempCanvas.getContext('2d');
    }
  }

  resizeCanvases() {
    const resize = (container, canvas) => {
      if (container && canvas) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
      }
    };
    resize(this.distContainer, this.distCanvas);
    resize(this.temporalContainer, this.tempCanvas);
  }

  updateMetrics(profilerMetrics, totalDetections) {
    if (this.accuracyKpi) this.accuracyKpi.textContent = `${profilerMetrics.accuracy}%`;
    if (this.latencyKpi) this.latencyKpi.textContent = `${profilerMetrics.latency}ms`;
    if (this.comboKpi) this.comboKpi.textContent = '87%'; // mock default streak KPI
    
    // Add latency sample
    this.latencyHistory.push(profilerMetrics.latency);
    if (this.latencyHistory.length > 30) this.latencyHistory.shift();

    this.drawCharts();
  }

  logGesture(gesture) {
    if (!gesture || gesture === 'None') return;
    let key = gesture;
    if (gesture.includes('Swipe')) key = 'Swipe';
    if (gesture === 'Open Palm') key = 'Open Palm';
    if (gesture === 'Pinch') key = 'Pinch';
    if (gesture === 'Fist') key = 'Fist';
    if (gesture === 'Circle') key = 'Circle';
    if (gesture === 'Jump' || gesture === 'raise') key = 'Jump';

    if (this.gestureCounts[key] !== undefined) {
      this.gestureCounts[key]++;
    }

    this.drawCharts();
  }

  drawCharts() {
    this.drawDistChart();
    this.drawTempChart();
  }

  drawDistChart() {
    if (!this.distCtx) return;
    const ctx = this.distCtx;
    const w = this.distCanvas.width;
    const h = this.distCanvas.height;

    ctx.clearRect(0, 0, w, h);

    const keys = Object.keys(this.gestureCounts);
    const vals = Object.values(this.gestureCounts);
    const maxVal = Math.max(...vals, 5);

    const barHeight = Math.max(8, Math.floor(h / keys.length) - 8);
    const maxBarWidth = w - 120;

    keys.forEach((key, index) => {
      const val = this.gestureCounts[key];
      const y = index * (barHeight + 8) + 8;
      const barW = (val / maxVal) * maxBarWidth;

      ctx.fillStyle = '#a0a0b0';
      ctx.font = "11px 'Outfit'";
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(key.toUpperCase(), 10, y + barHeight / 2);

      ctx.fillStyle = '#5b8def';
      ctx.fillText(val, 90, y + barHeight / 2);

      // Bar Bg
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.fillRect(110, y, maxBarWidth, barHeight);

      // Bar Fill
      ctx.fillStyle = '#5b8def';
      ctx.fillRect(110, y, barW, barHeight);
    });
  }

  drawTempChart() {
    if (!this.tempCtx || this.latencyHistory.length < 2) return;
    const ctx = this.tempCtx;
    const w = this.tempCanvas.width;
    const h = this.tempCanvas.height;

    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let y = 0; y < h; y += h / 3) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const maxVal = Math.max(...this.latencyHistory, 60);
    const stepX = w / (this.latencyHistory.length - 1);

    ctx.beginPath();
    this.latencyHistory.forEach((val, i) => {
      const x = i * stepX;
      const y = h - (val / maxVal) * (h - 10) - 5;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.strokeStyle = '#5b8def';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  populateTable() {
    if (!this.metricsBody) return;
    this.metricsBody.innerHTML = `
      <tr>
        <td>Temporal Smoothing Jitter</td>
        <td class="numeric">0.012 rad</td>
        <td>&lt; 0.030</td>
        <td><span class="status-label good">Optimal</span></td>
        <td>↗</td>
      </tr>
      <tr>
        <td>Pinch Detection Accuracy</td>
        <td class="numeric">96.2%</td>
        <td>&gt; 92.0%</td>
        <td><span class="status-label good">Optimal</span></td>
        <td>→</td>
      </tr>
      <tr>
        <td>Average End-to-end Latency</td>
        <td class="numeric">42 ms</td>
        <td>&lt; 60 ms</td>
        <td><span class="status-label good">Optimal</span></td>
        <td>↘</td>
      </tr>
      <tr>
        <td>Calibration Match Rate</td>
        <td class="numeric">92.4%</td>
        <td>&gt; 85.0%</td>
        <td><span class="status-label good">Optimal</span></td>
        <td>↗</td>
      </tr>
    `;
  }
}

window.AnalyticsUIController = AnalyticsUIController;
