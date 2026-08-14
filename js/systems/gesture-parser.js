/**
 * GestureForge Gesture Parser
 * Handles landmark feature extraction, heuristics, calibration math, and confidence.
 */
class CyberGestureClassifier {
  constructor() {
    // Calibration parameters for left and right hands separately
    this.calibrations = {
      right: {
        isCalibrated: false,
        handScale: GF_CONFIG.ACCESSIBILITY.handScale || 0.12,
        fistThreshold: 0.55,    // Curl threshold for fist
        palmThreshold: 0.85,    // Curl threshold for open palm
        pinchThreshold: 0.25,   // Distance ratio thumb to index
        sensitivity: GF_CONFIG.ACCESSIBILITY.SENSITIVITY,
        customGestures: {}
      },
      left: {
        isCalibrated: false,
        handScale: GF_CONFIG.ACCESSIBILITY.handScale || 0.12,
        fistThreshold: 0.55,    // Curl threshold for fist
        palmThreshold: 0.85,    // Curl threshold for open palm
        pinchThreshold: 0.25,   // Distance ratio thumb to index
        sensitivity: GF_CONFIG.ACCESSIBILITY.SENSITIVITY,
        customGestures: {}
      }
    };
    this.activeHand = 'right';
    this.calibration = this.calibrations[this.activeHand];

    this.MIN_THRESHOLD_GAP = GF_CONFIG.CALIBRATION.GAP_MIN;
    this.history = [];
    this.historyMaxLength = 30;
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

  setActiveHand(hand) {
    const nextHand = hand === 'left' ? 'left' : 'right';
    if (this.activeHand !== nextHand) {
      this.activeHand = nextHand;
      this.calibration = this.calibrations[this.activeHand];
      console.log(`Classifier switched active hand calibration to: ${this.activeHand}`);
    }
  }

  addCustomGesture(name, mappedAction) {
    const actions = {
      'pinch': 'Pinch',
      'open_palm': 'Open Palm',
      'fist': 'Fist',
      'circle': 'Circle'
    };
    const actionName = actions[mappedAction] || mappedAction;

    ['right', 'left'].forEach(hand => {
      this.calibrations[hand].customGestures = this.calibrations[hand].customGestures || {};
      this.calibrations[hand].customGestures[name] = {
        indexCurl: 0,
        middleCurl: 0,
        ringCurl: 0,
        pinkyCurl: 0,
        pinchDist: 0,
        mappedAction: actionName,
        isCalibrated: false
      };
    });
  }

  removeCustomGesture(name) {
    ['right', 'left'].forEach(hand => {
      if (this.calibrations[hand].customGestures) {
        delete this.calibrations[hand].customGestures[name];
      }
    });
  }

  getCustomGesturesList() {
    if (!this.calibration.customGestures) return [];
    return Object.keys(this.calibration.customGestures);
  }

  setSensitivity(val) {
    this.calibrations.right.sensitivity = val;
    this.calibrations.left.sensitivity = val;
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

    const indexTipRel = {
      x: (landmarks[8].x - landmarks[0].x) / handScale,
      y: (landmarks[8].y - landmarks[0].y) / handScale
    };

    return {
      handScale,
      indexCurl,
      middleCurl,
      ringCurl,
      pinkyCurl,
      pinchDist,
      wrist,
      indexTip: landmarks[8],
      indexTipRel,
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

    // Reset only the active hand's calibration learned parameters (preserve sensitivity)
    const hand = this.activeHand;
    this.calibrations[hand].isCalibrated = false;
    this.calibrations[hand].handScale = GF_CONFIG.ACCESSIBILITY.handScale || 0.12;
    this.calibrations[hand].fistThreshold = 0.55;
    this.calibrations[hand].palmThreshold = 0.85;
    this.calibrations[hand].pinchThreshold = 0.25;

    // Reset custom gestures calibrated states
    if (this.calibrations[hand].customGestures) {
      Object.keys(this.calibrations[hand].customGestures).forEach(name => {
        this.calibrations[hand].customGestures[name].isCalibrated = false;
        this.calibrations[hand].customGestures[name].indexCurl = 0;
        this.calibrations[hand].customGestures[name].middleCurl = 0;
        this.calibrations[hand].customGestures[name].ringCurl = 0;
        this.calibrations[hand].customGestures[name].pinkyCurl = 0;
        this.calibrations[hand].customGestures[name].pinchDist = 0;
      });
    }
  }

  resetAllCalibrations() {
    this.calibrationSession.step = 0;
    this.calibrationSession.samples = [];
    this.calibrationSession.progress = 0;
    this.calibrationSession.inProgress = false;

    // Reset both calibrations (preserve sensitivity)
    Object.keys(this.calibrations).forEach(hand => {
      this.calibrations[hand].isCalibrated = false;
      this.calibrations[hand].handScale = GF_CONFIG.ACCESSIBILITY.handScale || 0.12;
      this.calibrations[hand].fistThreshold = 0.55;
      this.calibrations[hand].palmThreshold = 0.85;
      this.calibrations[hand].pinchThreshold = 0.25;

      // Reset custom gestures calibrated states
      if (this.calibrations[hand].customGestures) {
        Object.keys(this.calibrations[hand].customGestures).forEach(name => {
          this.calibrations[hand].customGestures[name].isCalibrated = false;
          this.calibrations[hand].customGestures[name].indexCurl = 0;
          this.calibrations[hand].customGestures[name].middleCurl = 0;
          this.calibrations[hand].customGestures[name].ringCurl = 0;
          this.calibrations[hand].customGestures[name].pinkyCurl = 0;
          this.calibrations[hand].customGestures[name].pinchDist = 0;
        });
      }
    });
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

      if (this.getCustomGesturesList().length === 0) {
        this.calibration.isCalibrated = true;
      }
    } else if (step > 3) {
      const customList = this.getCustomGesturesList();
      const customName = customList[step - 4];
      if (customName) {
        this.calibration.customGestures[customName].indexCurl = avgOf(s => s.indexCurl);
        this.calibration.customGestures[customName].middleCurl = avgOf(s => s.middleCurl);
        this.calibration.customGestures[customName].ringCurl = avgOf(s => s.ringCurl);
        this.calibration.customGestures[customName].pinkyCurl = avgOf(s => s.pinkyCurl);
        this.calibration.customGestures[customName].pinchDist = avgOf(s => s.pinchDist);
        this.calibration.customGestures[customName].isCalibrated = true;
        console.log(`Calibrated custom gesture "${customName}":`, this.calibration.customGestures[customName]);
      }

      if (step === 3 + customList.length) {
        this.calibration.isCalibrated = true;
      }
    }
  }

  advanceCalibrationStep() {
    this.calibrationSession.samples = [];
    this.calibrationSession.progress = 0;
    this.calibrationSession.inProgress = false;

    const totalSteps = 3 + this.getCustomGesturesList().length;
    if (this.calibrationSession.step < totalSteps) {
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

    // Check calibrated custom gestures
    if (this.calibration.customGestures) {
      for (const [name, template] of Object.entries(this.calibration.customGestures)) {
        if (!template.isCalibrated) continue;
        const confidence = this.calculateCustomConfidence(features, template);
        if (confidence > maxConfidence) {
          maxConfidence = confidence;
          detectedGesture = name;
        }
      }
    }

    if (maxConfidence >= this.getExecutionThreshold()) {
      return { gesture: detectedGesture, confidence: maxConfidence, predictedX };
    }

    return { gesture: 'None', confidence: maxConfidence, predictedX };
  }

  getExecutionThreshold() {
    const s = this.calibration.sensitivity;
    return Math.max(0.55, Math.min(0.95, 0.85 - (s - 1.0) * 0.3));
  }

  calculateCustomConfidence(f, template) {
    const dIndex = Math.abs(f.indexCurl - template.indexCurl);
    const dMiddle = Math.abs(f.middleCurl - template.middleCurl);
    const dRing = Math.abs(f.ringCurl - template.ringCurl);
    const dPinky = Math.abs(f.pinkyCurl - template.pinkyCurl);
    const dPinch = Math.abs(f.pinchDist - template.pinchDist);

    const maxDiff = 0.22; // Tolerance threshold
    const avgDiff = (dIndex + dMiddle + dRing + dPinky + dPinch) / 5;
    
    if (avgDiff >= maxDiff) return 0.0;
    return 1.0 - (avgDiff / maxDiff);
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

    const newest = this.history[this.history.length - 1];
    const frames = this.history.filter(frame => newest.time - frame.time <= 450).slice(-12);
    if (frames.length < 5) return null;
    const deltaX = frames[frames.length - 1].wrist.x - frames[0].wrist.x;
    const deltaY = frames[frames.length - 1].wrist.y - frames[0].wrist.y;

    const swipeThreshold = 0.055;
    if (Math.abs(deltaX) < swipeThreshold) return null;

    if (Math.abs(deltaY) > Math.abs(deltaX) * 0.65) return null;

    const elapsed = frames[frames.length - 1].time - frames[0].time;
    if (elapsed < 80 || elapsed > 500) return null;

    this.lastSwipeTime = now;

    const sign = Math.sign(deltaX);
    const movingRightOnScreen = this.mirrored ? sign < 0 : sign > 0;
    return movingRightOnScreen ? 'Swipe Right' : 'Swipe Left';
  }

  detectCircle() {
    if (this.history.length < 16) return false;

    const now = Date.now();
    if (now - this.lastCircleTime < this.CIRCLE_COOLDOWN) return false;

    const newest = this.history[this.history.length - 1];
    const frames = this.history.filter(frame => newest.time - frame.time <= 1300).slice(-30);
    if (frames.length < 16) return false;
    const points = frames.map(h => h.indexTip);

    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const width = maxX - minX;
    const height = maxY - minY;

    // Measure the finger on screen: a whole-hand circle keeps the finger in
    // the same relative position to the wrist, but should still be detected.
    if (width < 0.075 || height < 0.075) return false;

    const start = points[0];
    const end = points[points.length - 1];
    const distStartEnd = this.dist(start, end);
    const diagonal = Math.hypot(width, height);
    if (distStartEnd > diagonal * 0.65) return false;

    const centerX = xs.reduce((a, b) => a + b, 0) / points.length;
    const centerY = ys.reduce((a, b) => a + b, 0) / points.length;
    const center = { x: centerX, y: centerY };

    const radii = points.map(p => this.dist(p, center));
    const avgRadius = radii.reduce((a, b) => a + b, 0) / radii.length;
    if (avgRadius === 0) return false;

    const variance = radii.reduce((a, r) => a + Math.pow(r - avgRadius, 2), 0) / radii.length;
    const stdDev = Math.sqrt(variance);

    let previousAngle = Math.atan2(points[0].y - centerY, points[0].x - centerX);
    let accumulatedAngle = 0;
    for (let i = 1; i < points.length; i++) {
      const angle = Math.atan2(points[i].y - centerY, points[i].x - centerX);
      let delta = angle - previousAngle;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      accumulatedAngle += delta;
      previousAngle = angle;
    }

    if (stdDev / avgRadius < 0.5 && Math.abs(accumulatedAngle) >= Math.PI * 1.35) {
      this.lastCircleTime = now;
      return true;
    }

    return false;
  }
}

window.CyberGestureClassifier = CyberGestureClassifier;
