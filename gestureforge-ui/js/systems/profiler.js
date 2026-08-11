/**
 * GestureForge Performance Profiler
 * Monitors FPS, system latency, and false positive rates.
 */
class PerformanceProfiler {
  constructor() {
    this.fps = 60;
    this.latency = 25; // ms
    this.totalFrames = 0;
    this.lastTime = Date.now();
    
    this.detections = 0;
    this.falsePositives = 0;
  }

  tick() {
    this.totalFrames++;
    const now = Date.now();
    const elapsed = now - this.lastTime;
    if (elapsed >= 1000) {
      this.fps = Math.round((this.totalFrames * 1000) / elapsed);
      this.totalFrames = 0;
      this.lastTime = now;
    }
  }

  logLatency(ms) {
    this.latency = Math.max(1, Math.round(ms));
  }

  getMetrics() {
    const accuracy = this.detections > 0 
      ? ((this.detections - this.falsePositives) / this.detections) * 100 
      : 95;
    return {
      fps: this.fps,
      latency: this.latency,
      accuracy: Math.round(accuracy)
    };
  }
}

window.PerformanceProfiler = PerformanceProfiler;
