/**
 * One-Euro Filter implementation for smoothing landmarks.
 * Adaptive low-pass filter: increases smoothing at low speeds (reducing jitter) 
 * and decreases smoothing at high speeds (reducing latency).
 */
class LowPassFilter {
  constructor(alpha) {
    this.y = null;
    this.alpha = alpha;
  }
  setAlpha(alpha) {
    this.alpha = alpha;
  }
  filter(value) {
    if (this.y === null) {
      this.y = value;
    } else {
      this.y = this.y + this.alpha * (value - this.y);
    }
    return this.y;
  }
}

class OneEuroFilter {
  constructor(freq, mincutoff = 1.0, beta = 0.0, dcutoff = 1.0) {
    this.freq = freq;
    this.mincutoff = mincutoff;
    this.beta = beta;
    this.dcutoff = dcutoff;
    this.x = new LowPassFilter(this.alpha(mincutoff));
    this.dx = new LowPassFilter(this.alpha(dcutoff));
    this.lastTime = null;
  }

  alpha(cutoff) {
    const te = 1.0 / this.freq;
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / te);
  }

  filter(value, timestamp = null) {
    const now = timestamp || Date.now();
    if (this.lastTime !== null) {
      const dt = (now - this.lastTime) / 1000.0;
      if (dt > 0) this.freq = 1.0 / dt;
    }
    this.lastTime = now;

    // Estimate derivative
    const prevX = this.x.y;
    const dxValue = prevX === null ? 0 : (value - prevX) * this.freq;
    const filteredDx = this.dx.filter(dxValue);

    // Compute cutoff frequency
    const cutoff = this.mincutoff + this.beta * Math.abs(filteredDx);
    
    // Filter value
    this.x.setAlpha(this.alpha(cutoff));
    return this.x.filter(value);
  }

  reset() {
    this.x.y = null;
    this.dx.y = null;
    this.lastTime = null;
  }
}
