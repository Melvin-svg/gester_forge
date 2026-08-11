/**
 * GestureForge Gesture Classifier & Calibrator
 * Handles adaptive calibration, custom heuristics, confidence calculation, and temporal prediction.
 */
class CyberGestureClassifier {
  constructor() {
    // Calibration parameters (normalized by hand scale)
    this.calibration = {
      isCalibrated: false,
      handScale: 0.12,        // Wrist (0) to Middle Knuckle (9) distance in camera space
      fistThreshold: 0.55,    // Curl threshold for fist
      palmThreshold: 0.85,    // Curl threshold for open palm
      pinchThreshold: 0.25,   // Distance ratio between thumb tip (4) and index tip (8)
      sensitivity: 1.0        // Global sensitivity scalar
    };

    // Minimum separation kept between the fist and palm curl thresholds so the
    // confidence ramps below never divide by zero (or go negative).
    this.MIN_THRESHOLD_GAP = 0.12;

    // Tracking state for velocity and gesture sequences
    this.history = [];
    this.historyMaxLength = 20;

    // Whether the camera preview is mirrored. Landmarks always arrive in raw
    // (un-mirrored) camera space, so the on-screen direction of motion is
    // flipped relative to the coordinates when the preview is mirrored.
    this.mirrored = true;

    // Cooldowns for dynamic gestures. Previously the history buffer was wiped
    // on every detection, which also destroyed the velocity data used for
    // position prediction. Timestamps achieve the same de-bounce without it.
    this.lastSwipeTime = 0;
    this.lastCircleTime = 0;
    this.SWIPE_COOLDOWN = 500;   // ms
    this.CIRCLE_COOLDOWN = 1200; // ms

    // Active calibration session details.
    // Step advancement is owned exclusively by the caller (app.js) via
    // advanceCalibrationStep(); this module only measures and applies values.
    this.calibrationSession = {
      inProgress: false,
      step: 0, // 0: Size, 1: Pinch, 2: Palm, 3: Fist
      samples: [],
      progress: 0
    };
  }

  /**
   * Helper: Calculate 2D Euclidean Distance between two landmarks
   */
  dist(p1, p2) {
    if (!p1 || !p2) return 999;
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
  }

  /**
   * Update calibration sensitivity
   */
  setSensitivity(val) {
    this.calibration.sensitivity = val;
  }

  /**
   * Tell the classifier whether the preview the user sees is mirrored.
   */
  setMirrored(mirrored) {
    this.mirrored = mirrored;
  }

  /**
   * Extract features from a set of hand landmarks
   */
  extractFeatures(landmarks) {
    if (!landmarks || landmarks.length < 21) return null;

    // Hand scale: wrist to middle knuckle (0 to 9)
    const handScale = this.dist(landmarks[0], landmarks[9]);
    if (handScale === 0) return null;

    // Normalizing joint distances relative to handScale
    const indexCurl = this.dist(landmarks[8], landmarks[5]) / handScale;
    const middleCurl = this.dist(landmarks[12], landmarks[9]) / handScale;
    const ringCurl = this.dist(landmarks[16], landmarks[13]) / handScale;
    const pinkyCurl = this.dist(landmarks[20], landmarks[17]) / handScale;

    // Pinch distance: thumb tip (4) to index tip (8)
    const pinchDist = this.dist(landmarks[4], landmarks[8]) / handScale;

    // Wrist positions (useful for swiping and coordinate-based control)
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

  /**
   * Begin sampling for the current calibration step.
   */
  beginCalibrationStep() {
    this.calibrationSession.samples = [];
    this.calibrationSession.progress = 0;
    this.calibrationSession.inProgress = true;
  }

  /**
   * Reset the whole wizard back to the first step.
   */
  resetCalibration() {
    this.calibrationSession.step = 0;
    this.calibrationSession.samples = [];
    this.calibrationSession.progress = 0;
    this.calibrationSession.inProgress = false;
  }

  /**
   * Run calibration wizard tick (processes frame samples).
   * Returns the current progress (0-100), or null when not sampling.
   * Progress is held at 100 once the step's samples are applied so the caller
   * can reliably observe completion; it is cleared by advanceCalibrationStep().
   */
  processCalibrationFrame(landmarks) {
    if (!this.calibrationSession.inProgress || !landmarks) return null;

    const features = this.extractFeatures(landmarks);
    if (!features) return null;

    this.calibrationSession.samples.push(features);
    // Sampling over 40 frames (~1.3s at 30fps)
    this.calibrationSession.progress = Math.min(100, this.calibrationSession.progress + 2.5);

    if (this.calibrationSession.progress >= 100) {
      this.calibrationSession.inProgress = false;
      this.applyCalibrationStep();
    }

    return this.calibrationSession.progress;
  }

  /**
   * Compute and store the threshold measured by the step that just finished.
   * Does NOT advance the step counter.
   */
  applyCalibrationStep() {
    const step = this.calibrationSession.step;
    const samples = this.calibrationSession.samples;
    if (samples.length === 0) return;

    const avgOf = (fn) => samples.reduce((acc, s) => acc + fn(s), 0) / samples.length;
    const avgCurl = (s) => (s.indexCurl + s.middleCurl + s.ringCurl + s.pinkyCurl) / 4;

    if (step === 0) {
      // Calibrate hand size (average hand scale)
      this.calibration.handScale = avgOf(s => s.handScale);
      console.log(`Calibrated hand scale: ${this.calibration.handScale.toFixed(4)}`);
    } else if (step === 1) {
      // Calibrate pinch threshold (measured pinch + margin)
      const avgPinch = avgOf(s => s.pinchDist);
      this.calibration.pinchThreshold = Math.max(0.12, Math.min(0.35, avgPinch * 1.3));
      console.log(`Calibrated pinch threshold: ${this.calibration.pinchThreshold.toFixed(4)}`);
    } else if (step === 2) {
      // Calibrate palm threshold (measured straight-finger curl - margin)
      const avgPalm = avgOf(avgCurl);
      this.calibration.palmThreshold = Math.max(0.65, avgPalm * 0.85);
      console.log(`Calibrated open palm threshold: ${this.calibration.palmThreshold.toFixed(4)}`);
    } else if (step === 3) {
      // Calibrate fist threshold (measured curled-finger curl + margin), kept a
      // guaranteed distance below the palm threshold.
      const avgFist = avgOf(avgCurl);
      const ceiling = this.calibration.palmThreshold - this.MIN_THRESHOLD_GAP;
      this.calibration.fistThreshold = Math.max(0.1, Math.min(ceiling, avgFist * 1.25));
      console.log(`Calibrated fist threshold: ${this.calibration.fistThreshold.toFixed(4)}`);

      this.calibration.isCalibrated = true;
    }
  }

  /**
   * Move to the next calibration step. Returns true if another step remains.
   */
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

  /**
   * Classify gestures on smoothed landmarks
   */
  classify(landmarks) {
    if (!landmarks) return { gesture: 'None', confidence: 0, predictedX: 0.5 };

    const features = this.extractFeatures(landmarks);
    if (!features) return { gesture: 'None', confidence: 0, predictedX: 0.5 };

    // Update coordinate history
    this.history.push(features);
    if (this.history.length > this.historyMaxLength) {
      this.history.shift();
    }

    // 1. Position prediction (3 frames ahead), extrapolated from recent velocity
    let predictedX = features.wrist.x;
    if (this.history.length >= 3) {
      const prev = this.history[this.history.length - 3];
      const vx = (features.wrist.x - prev.wrist.x) / 3;
      predictedX = features.wrist.x + vx * 3;
    }
    // Report in the same orientation the user sees, then clamp to bounds
    if (this.mirrored) predictedX = 1 - predictedX;
    predictedX = Math.max(0, Math.min(1, predictedX));

    // 2. Classify dynamic gestures (Swipe & Circle)
    const swipeGesture = this.detectSwipe();
    if (swipeGesture) {
      return { gesture: swipeGesture, confidence: 0.95, predictedX };
    }

    if (this.detectCircle()) {
      return { gesture: 'Circle', confidence: 0.90, predictedX };
    }

    // 3. Classify static gestures with adaptive calibrated bounds and confidence
    let detectedGesture = 'None';
    let maxConfidence = 0;

    // Open Palm check: all fingers straight
    const palmConfidence = this.calculatePalmConfidence(features);
    if (palmConfidence > maxConfidence) {
      maxConfidence = palmConfidence;
      detectedGesture = 'Open Palm';
    }

    // Fist check: all fingers curled
    const fistConfidence = this.calculateFistConfidence(features);
    if (fistConfidence > maxConfidence) {
      maxConfidence = fistConfidence;
      detectedGesture = 'Fist';
    }

    // Pinch check. A pinch is also a partially-curled hand, so it is only
    // allowed to win when the fingers are not fully clenched into a fist.
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

  /**
   * Confidence a gesture must reach to fire.
   * Higher sensitivity => lower bar. Always stays inside a reachable range,
   * since confidence values are capped at 1.0.
   */
  getExecutionThreshold() {
    const s = this.calibration.sensitivity;
    return Math.max(0.45, Math.min(0.95, 0.85 - (s - 1.0) * 0.3));
  }

  /* Confidence Helpers */
  calculatePalmConfidence(f) {
    const avgCurl = (f.indexCurl + f.middleCurl + f.ringCurl + f.pinkyCurl) / 4;
    const threshold = this.calibration.palmThreshold;
    if (avgCurl >= threshold) return 1.0;
    // Linear scaling below threshold
    return Math.max(0, avgCurl / threshold);
  }

  calculateFistConfidence(f) {
    const avgCurl = (f.indexCurl + f.middleCurl + f.ringCurl + f.pinkyCurl) / 4;
    const threshold = this.calibration.fistThreshold;
    if (avgCurl <= threshold) return 1.0;
    // Linear scaling above threshold up to the palm boundary
    const range = Math.max(this.MIN_THRESHOLD_GAP, this.calibration.palmThreshold - threshold);
    return Math.max(0, 1 - (avgCurl - threshold) / range);
  }

  calculatePinchConfidence(f) {
    const dist = f.pinchDist;
    const threshold = this.calibration.pinchThreshold;
    if (dist <= threshold) return 1.0;
    // Linear scaling up to double threshold
    return Math.max(0, 1 - (dist - threshold) / threshold);
  }

  /**
   * Detect quick wrist swipe movements in the history buffer.
   * Requires consistent direction and a mostly-horizontal, fast path so that
   * ordinary repositioning of the hand is not read as a dash.
   */
  detectSwipe() {
    if (this.history.length < 5) return null;

    const now = Date.now();
    if (now - this.lastSwipeTime < this.SWIPE_COOLDOWN) return null;

    const frames = this.history.slice(-5);
    const deltaX = frames[frames.length - 1].wrist.x - frames[0].wrist.x;
    const deltaY = frames[frames.length - 1].wrist.y - frames[0].wrist.y;

    const swipeThreshold = 0.15; // Width proportion of camera view
    if (Math.abs(deltaX) < swipeThreshold) return null;

    // Must be predominantly horizontal
    if (Math.abs(deltaY) > Math.abs(deltaX) * 0.6) return null;

    // Must move consistently in one direction across every sampled frame
    const sign = Math.sign(deltaX);
    for (let i = 1; i < frames.length; i++) {
      const stepDx = frames[i].wrist.x - frames[i - 1].wrist.x;
      if (Math.sign(stepDx) === -sign && Math.abs(stepDx) > 0.01) return null;
    }

    // Must be fast (guards against a slow drift across the frame)
    const elapsed = frames[frames.length - 1].time - frames[0].time;
    if (elapsed > 400) return null;

    this.lastSwipeTime = now;

    // Report the direction the user perceives on screen
    const movingRightOnScreen = this.mirrored ? sign < 0 : sign > 0;
    return movingRightOnScreen ? 'Swipe Right' : 'Swipe Left';
  }

  /**
   * Detect circular tracing movements using index finger tip
   */
  detectCircle() {
    if (this.history.length < 12) return false;

    const now = Date.now();
    if (now - this.lastCircleTime < this.CIRCLE_COOLDOWN) return false;

    const points = this.history.slice(-12).map(h => h.indexTip);

    // 1. Check bounding box size (ensure it is actually a drawing motion, not static)
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const width = maxX - minX;
    const height = maxY - minY;

    if (width < 0.08 || height < 0.08) return false;

    // 2. Check if end point loops back near the start point
    const start = points[0];
    const end = points[points.length - 1];
    const distStartEnd = this.dist(start, end);
    const diagonal = Math.hypot(width, height);
    if (distStartEnd > diagonal * 0.45) return false; // Start and end are too far apart

    // 3. Compute centroid
    const centerX = xs.reduce((a, b) => a + b, 0) / points.length;
    const centerY = ys.reduce((a, b) => a + b, 0) / points.length;
    const center = { x: centerX, y: centerY };

    // 4. Check if distances to centroid have low variance (is it circular?)
    const radii = points.map(p => this.dist(p, center));
    const avgRadius = radii.reduce((a, b) => a + b, 0) / radii.length;
    if (avgRadius === 0) return false;

    // Standard deviation of radius
    const variance = radii.reduce((a, r) => a + Math.pow(r - avgRadius, 2), 0) / radii.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev / avgRadius < 0.3) {
      this.lastCircleTime = now;
      return true;
    }

    return false;
  }
}

// Export class globally
window.CyberGestureClassifier = CyberGestureClassifier;
