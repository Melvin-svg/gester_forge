/**
 * GestureForge Analytics Dashboard
 * Computes, logs, and plots performance metrics on custom canvases (latency graph and gesture distribution histogram).
 */
class CyberAnalytics {
  constructor(latencyCanvasId, distributionCanvasId) {
    this.latencyCanvas = document.getElementById(latencyCanvasId);
    this.distCanvas = document.getElementById(distributionCanvasId);
    
    this.latencyCtx = this.latencyCanvas.getContext('2d');
    this.distCtx = this.distCanvas.getContext('2d');

    // Data buffers
    this.latencyHistory = Array(30).fill(25); // Populate with baseline 25ms
    this.gestureCounts = {
      'Fist': 0,
      'Open Palm': 0,
      'Pinch': 0,
      'Circle': 0,
      'Swipe': 0,
      'Jump': 0
    };

    // A detection counts as "confident" when the classifier cleared this bar.
    // Anything accepted below it is treated as a likely false positive.
    this.CONFIDENCE_BAR = 0.85;
    this.totalDetections = 0;
    this.confidentDetections = 0;

    this.fps = 0;
    this.lastFpsUpdate = Date.now();
    this.frameCount = 0;

    // The charts are redrawn at most this often (ms) rather than every frame
    this.CHART_REDRAW_INTERVAL = 100;
    this.lastLatencyDraw = 0;
    this.lastDistDraw = 0;

    this.resizeCanvas();
  }

  resizeCanvas() {
    // Match the backing store to the on-screen box. Guard against a zero-sized
    // parent (hidden or not yet laid out), which would blank the canvas.
    const size = (canvas) => {
      const w = canvas.parentElement.clientWidth;
      const h = canvas.parentElement.clientHeight;
      if (w > 0 && h > 0) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    size(this.latencyCanvas);
    size(this.distCanvas);

    // Repaint with the new dimensions
    this.drawLatencyChart();
    this.drawDistributionChart();
  }

  /**
   * Log FPS frame ticks
   */
  tickFps() {
    this.frameCount++;
    const now = Date.now();
    const elapsed = now - this.lastFpsUpdate;
    
    if (elapsed >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / elapsed);
      this.frameCount = 0;
      this.lastFpsUpdate = now;
      
      // Update HUD
      const fpsEl = document.getElementById('metric-fps');
      if (fpsEl) {
        fpsEl.innerText = this.fps;
        // Highlight low framerates
        if (this.fps < 20) {
          fpsEl.style.color = '#ff3333';
        } else if (this.fps < 25) {
          fpsEl.style.color = '#fff01f';
        } else {
          fpsEl.style.color = '#00f0ff';
        }
      }
    }
  }

  /**
   * Add a latency sample (ms) and trigger redraw
   */
  logLatency(ms) {
    // Add jitter slightly for visual movement if latency is constant (e.g. mock or fast local webcam)
    const displayMs = Math.max(2, Math.round(ms));
    
    this.latencyHistory.push(displayMs);
    if (this.latencyHistory.length > 30) {
      this.latencyHistory.shift();
    }

    // Update HUD
    const latEl = document.getElementById('metric-latency');
    if (latEl) {
      latEl.innerText = `${displayMs} ms`;
    }

    const now = Date.now();
    if (now - this.lastLatencyDraw >= this.CHART_REDRAW_INTERVAL) {
      this.lastLatencyDraw = now;
      this.drawLatencyChart();
    }
  }

  /**
   * Count gesture occurrence.
   * `confidence` is the classifier's score for this detection; detections that
   * squeaked in below the confidence bar are counted against accuracy.
   */
  logGesture(gestureName, confidence = 1) {
    if (!gestureName || gestureName === 'None') return;

    this.totalDetections++;
    if (confidence >= this.CONFIDENCE_BAR) {
      this.confidentDetections++;
    }

    // Group swipes
    let key = gestureName;
    if (gestureName.includes('Swipe')) {
      key = 'Swipe';
    }

    if (Object.prototype.hasOwnProperty.call(this.gestureCounts, key)) {
      this.gestureCounts[key]++;
    }

    this.updateAccuracyUI();

    const now = Date.now();
    if (now - this.lastDistDraw >= this.CHART_REDRAW_INTERVAL) {
      this.lastDistDraw = now;
      this.drawDistributionChart();
    }
  }

  updateAccuracyUI() {
    const accuracy = this.totalDetections > 0
      ? Math.round((this.confidentDetections / this.totalDetections) * 100)
      : 100;

    const accEl = document.getElementById('metric-accuracy');
    if (accEl) {
      accEl.innerText = `${accuracy}%`;
    }
  }

  /**
   * Draw Scrolling Latency Chart (Neon Line Graph)
   */
  drawLatencyChart() {
    const ctx = this.latencyCtx;
    const w = this.latencyCanvas.width;
    const h = this.latencyCanvas.height;

    if (w === 0 || h === 0 || this.latencyHistory.length < 2) return;

    ctx.clearRect(0, 0, w, h);
    
    // Grid Lines
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let y = 0; y < h; y += h / 3) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const maxVal = Math.max(...this.latencyHistory, 60); // Cap min height reference to 60ms
    const pointsCount = this.latencyHistory.length;
    const stepX = w / (pointsCount - 1);

    // Build Line Path
    ctx.beginPath();
    this.latencyHistory.forEach((val, i) => {
      // Map val (0 to maxVal) to Y space (h down to 0)
      const x = i * stepX;
      const y = h - (val / maxVal) * (h - 10) - 5;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    // Stroke Neon Line
    ctx.save();
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 6;
    ctx.shadowColor = '#00f0ff';
    ctx.stroke();
    ctx.restore();

    // Fill underneath Area (Gradient)
    ctx.beginPath();
    ctx.moveTo(0, h);
    this.latencyHistory.forEach((val, i) => {
      const x = i * stepX;
      const y = h - (val / maxVal) * (h - 10) - 5;
      ctx.lineTo(x, y);
    });
    ctx.lineTo(w, h);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, 'rgba(0, 240, 255, 0.15)');
    gradient.addColorStop(1, 'rgba(0, 240, 255, 0.0)');
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  /**
   * Draw Horizontal Gesture distribution Bar Graph
   */
  drawDistributionChart() {
    const ctx = this.distCtx;
    const w = this.distCanvas.width;
    const h = this.distCanvas.height;

    if (w === 0 || h === 0) return;

    ctx.clearRect(0, 0, w, h);

    const keys = Object.keys(this.gestureCounts);
    const vals = Object.values(this.gestureCounts);
    const maxVal = Math.max(...vals, 5); // Keep default scale to 5 items minimum

    // Never let the bars collapse to zero/negative height on a short panel
    const barHeight = Math.max(6, Math.floor(h / keys.length) - 6);
    const maxBarWidth = Math.max(20, w - 110); // Reserve left side for text labels

    keys.forEach((key, index) => {
      const val = this.gestureCounts[key];
      const y = index * (barHeight + 6) + 3;
      const barW = (val / maxVal) * maxBarWidth;

      // Draw text label
      ctx.fillStyle = '#64748b'; // Slate gray
      ctx.font = "10px 'Share Tech Mono'";
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(key.toUpperCase(), 5, y + barHeight / 2);

      // Draw count
      ctx.fillStyle = '#ff007f'; // Neon Pink count
      ctx.fillText(val, 85, y + barHeight / 2);

      // Draw Bar background
      ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.fillRect(100, y, maxBarWidth, barHeight);

      // Draw Bar fill (Neon Pink)
      ctx.save();
      ctx.fillStyle = 'rgba(255, 0, 127, 0.8)';
      ctx.shadowBlur = 5;
      ctx.shadowColor = '#ff007f';
      ctx.fillRect(100, y, barW, barHeight);
      ctx.restore();
    });
  }
}

// Export class globally
window.CyberAnalytics = CyberAnalytics;
