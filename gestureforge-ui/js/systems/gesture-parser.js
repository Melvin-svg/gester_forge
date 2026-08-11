/**
 * GestureForge Gesture Parser
 * Handles landmark feature extraction, heuristics, calibration math, and confidence.
 */
class CyberGestureClassifier {
  constructor() {
    // Calibration parameters (normalized by hand scale)
    this.calibration = {
      isCalibrated: false,
      handScale: GF_CONFIG.ACCESSIBILITY.handScale || 0.12,
      fistThreshold: 0.55,    // Curl threshold for fist
      palmThreshold: 0.85,    // Curl threshold for open palm
      pinchThreshold: 0.25,   // Distance ratio thumb to index
      sensitivity: GF_CONFIG.ACCESSIBILITY.SENSITIVITY        // Global sensitivity scalar
    };

    this.MIN_THRESHOLD_GAP = GF_CONFIG.CALIBRATION.GAP_MIN;
    this.history = [];
    this.historyMaxLength = 20;
    this.mirrored = GF_CONFIG.ACCESSIBILITY.MIRRORED;

    this.lastSwipeTime = 0;
    this.lastCircleTime = 0;
    this.SWIPE_COOLDOWN = 500;   // ms
    this.CIRCLE_COOLDOWN = 1200; // ms

    this.calibrationSession = {
      inProgress: false,
      step: 0, // 0: Size, 1: Pinch, 2: Palm, 3: Fist
      samples: [],
      progress: 0
    };
  }

  dist(p1, p2) {
    if (!p1 || !p2) return 999;
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
  }

  setSensitivity(val) {
    this.calibration.sensitivity = val;
  }

  setMirrored(mirrored) {
    this.mirrored = mirrored;
  }

  extractFeatures(landmarks) {
    if (!landmarks || landmarks.length < 21) return null;

    const handScale = this.dist(landmarks[0], landmarks[9]);
    if (handScale === 0) return null;

    const indexCurl = this.dist(landmarks[8], landmarks[5]) / handScale;
    const middleCurl = this.dist(landmarks[12], landmarks[9]) / handScale;
    const ringCurl = this.dist(landmarks[16], landmarks[13]) / handScale;
    const pinkyCurl = this.dist(landmarks[20], landmarks[17]) / handScale;

    const pinchDist = this.dist(landmarks[4], landmarks[8]) / handScale;
    const wrist = landmarks[0];

    return {
      handScale,
      indexCurl,
      middleCurl,
      ringCurl,
      pinkyCurl,
      pinchDist,
      wrist,
      indexTip: landmarks[8],
      time: Date.now()
    };
  }

  beginCalibrationStep() {
    this.calibrationSession.samples = [];
    this.calibrationSession.progress = 0;
    this.calibrationSession.inProgress = true;
  }

  resetCalibration() {
    this.calibrationSession.step = 0;
    this.calibrationSession.samples = [];
    this.calibrationSession.progress = 0;
    this.calibrationSession.inProgress = false;
  }

  processCalibrationFrame(landmarks) {
    if (!this.calibrationSession.inProgress || !landmarks) return null;

    const features = this.extractFeatures(landmarks);
    if (!features) return null;

    this.calibrationSession.samples.push(features);
    this.calibrationSession.progress = Math.min(100, this.calibrationSession.progress + 2.5);

    if (this.calibrationSession.progress >= 100) {
      this.calibrationSession.inProgress = false;
      this.applyCalibrationStep();
    }

    return this.calibrationSession.progress;
  }

  applyCalibrationStep() {
    const step = this.calibrationSession.step;
    const samples = this.calibrationSession.samples;
    if (samples.length === 0) return;

    const avgOf = (fn) => samples.reduce((acc, s) => acc + fn(s), 0) / samples.length;
    const avgCurl = (s) => (s.indexCurl + s.middleCurl + s.ringCurl + s.pinkyCurl) / 4;

    if (step === 0) {
      this.calibration.handScale = avgOf(s => s.handScale);
      console.log(`Calibrated hand scale: ${this.calibration.handScale.toFixed(4)}`);
    } else if (step === 1) {
      const avgPinch = avgOf(s => s.pinchDist);
      this.calibration.pinchThreshold = Math.max(0.12, Math.min(0.35, avgPinch * 1.3));
      console.log(`Calibrated pinch threshold: ${this.calibration.pinchThreshold.toFixed(4)}`);
    } else if (step === 2) {
      const avgPalm = avgOf(avgCurl);
      this.calibration.palmThreshold = Math.max(0.65, avgPalm * 0.85);
      console.log(`Calibrated open palm threshold: ${this.calibration.palmThreshold.toFixed(4)}`);
    } else if (step === 3) {
      const avgFist = avgOf(avgCurl);
      const ceiling = this.calibration.palmThreshold - this.MIN_THRESHOLD_GAP;
      this.calibration.fistThreshold = Math.max(0.1, Math.min(ceiling, avgFist * 1.25));
      console.log(`Calibrated fist threshold: ${this.calibration.fistThreshold.toFixed(4)}`);

      this.calibration.isCalibrated = true;
    }
  }

  advanceCalibrationStep() {
    this.calibrationSession.samples = [];
    this.calibrationSession.progress = 0;
    this.calibrationSession.inProgress = false;

    if (this.calibrationSession.step < 3) {
      this.calibrationSession.step++;
      return true;
    }
    return false;
  }

  classify(landmarks) {
    if (!landmarks) return { gesture: 'None', confidence: 0, predictedX: 0.5 };

    const features = this.extractFeatures(landmarks);
    if (!features) return { gesture: 'None', confidence: 0, predictedX: 0.5 };

    this.history.push(features);
    if (this.history.length > this.historyMaxLength) {
      this.history.shift();
    }

    // Position prediction (3 frames ahead), extrapolated from recent velocity
    let predictedX = features.wrist.x;
    if (this.history.length >= 3) {
      const prev = this.history[this.history.length - 3];
      const vx = (features.wrist.x - prev.wrist.x) / 3;
      predictedX = features.wrist.x + vx * 3;
    }
    if (this.mirrored) predictedX = 1 - predictedX;
    predictedX = Math.max(0, Math.min(1, predictedX));

    const swipeGesture = this.detectSwipe();
    if (swipeGesture) {
      return { gesture: swipeGesture, confidence: 0.95, predictedX };
    }

    if (this.detectCircle()) {
      return { gesture: 'Circle', confidence: 0.90, predictedX };
    }

    let detectedGesture = 'None';
    let maxConfidence = 0;

    const palmConfidence = this.calculatePalmConfidence(features);
    if (palmConfidence > maxConfidence) {
      maxConfidence = palmConfidence;
      detectedGesture = 'Open Palm';
    }

    const fistConfidence = this.calculateFistConfidence(features);
    if (fistConfidence > maxConfidence) {
      maxConfidence = fistConfidence;
      detectedGesture = 'Fist';
    }

    const pinchConfidence = this.calculatePinchConfidence(features);
    if (pinchConfidence > maxConfidence && fistConfidence < 1.0) {
      maxConfidence = pinchConfidence;
      detectedGesture = 'Pinch';
    }

    if (maxConfidence >= this.getExecutionThreshold()) {
      return { gesture: detectedGesture, confidence: maxConfidence, predictedX };
    }

    return { gesture: 'None', confidence: maxConfidence, predictedX };
  }

  getExecutionThreshold() {
    const s = this.calibration.sensitivity;
    return Math.max(0.45, Math.min(0.95, 0.85 - (s - 1.0) * 0.3));
  }

  calculatePalmConfidence(f) {
    const avgCurl = (f.indexCurl + f.middleCurl + f.ringCurl + f.pinkyCurl) / 4;
    const threshold = this.calibration.palmThreshold;
    if (avgCurl >= threshold) return 1.0;
    return Math.max(0, avgCurl / threshold);
  }

  calculateFistConfidence(f) {
    const avgCurl = (f.indexCurl + f.middleCurl + f.ringCurl + f.pinkyCurl) / 4;
    const threshold = this.calibration.fistThreshold;
    if (avgCurl <= threshold) return 1.0;
    const range = Math.max(this.MIN_THRESHOLD_GAP, this.calibration.palmThreshold - threshold);
    return Math.max(0, 1 - (avgCurl - threshold) / range);
  }

  calculatePinchConfidence(f) {
    const dist = f.pinchDist;
    const threshold = this.calibration.pinchThreshold;
    if (dist <= threshold) return 1.0;
    return Math.max(0, 1 - (dist - threshold) / threshold);
  }

  detectSwipe() {
    if (this.history.length < 5) return null;

    const now = Date.now();
    if (now - this.lastSwipeTime < this.SWIPE_COOLDOWN) return null;

    const frames = this.history.slice(-5);
    const deltaX = frames[frames.length - 1].wrist.x - frames[0].wrist.x;
    const deltaY = frames[frames.length - 1].wrist.y - frames[0].wrist.y;

    const swipeThreshold = 0.15;
    if (Math.abs(deltaX) < swipeThreshold) return null;

    if (Math.abs(deltaY) > Math.abs(deltaX) * 0.6) return null;

    const sign = Math.sign(deltaX);
    for (let i = 1; i < frames.length; i++) {
      const stepDx = frames[i].wrist.x - frames[i - 1].wrist.x;
      if (Math.sign(stepDx) === -sign && Math.abs(stepDx) > 0.01) return null;
    }

    const elapsed = frames[frames.length - 1].time - frames[0].time;
    if (elapsed > 400) return null;

    this.lastSwipeTime = now;

    const movingRightOnScreen = this.mirrored ? sign < 0 : sign > 0;
    return movingRightOnScreen ? 'Swipe Right' : 'Swipe Left';
  }

  detectCircle() {
    if (this.history.length < 12) return false;

    const now = Date.now();
    if (now - this.lastCircleTime < this.CIRCLE_COOLDOWN) return false;

    const points = this.history.slice(-12).map(h => h.indexTip);

    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const width = maxX - minX;
    const height = maxY - minY;

    if (width < 0.08 || height < 0.08) return false;

    const start = points[0];
    const end = points[points.length - 1];
    const distStartEnd = this.dist(start, end);
    const diagonal = Math.hypot(width, height);
    if (distStartEnd > diagonal * 0.45) return false;

    const centerX = xs.reduce((a, b) => a + b, 0) / points.length;
    const centerY = ys.reduce((a, b) => a + b, 0) / points.length;
    const center = { x: centerX, y: centerY };

    const radii = points.map(p => this.dist(p, center));
    const avgRadius = radii.reduce((a, b) => a + b, 0) / radii.length;
    if (avgRadius === 0) return false;

    const variance = radii.reduce((a, r) => a + Math.pow(r - avgRadius, 2), 0) / radii.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev / avgRadius < 0.3) {
      this.lastCircleTime = now;
      return true;
    }

    return false;
  }
}

window.CyberGestureClassifier = CyberGestureClassifier;
