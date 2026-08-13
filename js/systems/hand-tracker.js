/**
 * CyberHandTracker
 * Coordinates MediaPipe SDK loading and stream processing with smoothing.
 */
class CyberHandTracker {
  constructor(videoElement, onResultsCallback) {
    this.video = videoElement;
    this.onResults = onResultsCallback;
    
    // Sensitivity and parameters for One-Euro Filters
    this.minCutoff = 0.5; // Lower = more smooth at rest
    this.beta = 0.05;      // Higher = faster response at high speeds
    
    // Accessibility options
    this.maxNumHands = 1;
    this.preferredHand = 'right';

    // MediaPipe reports handedness assuming a mirrored (selfie) input image.
    // We forward the raw, un-mirrored camera frames, so the reported label is
    // the opposite of the user's real hand and must be flipped.
    this.HANDEDNESS_IS_FLIPPED = true;

    this.initFilters();
    this.isInitialized = false;
    this.isTracking = false;
    this.lastFrameTime = Date.now();
  }

  initFilters() {
    // 21 landmarks total from MediaPipe Hands
    this.filtersX = Array.from({ length: 21 }, () => new OneEuroFilter(30, this.minCutoff, this.beta));
    this.filtersY = Array.from({ length: 21 }, () => new OneEuroFilter(30, this.minCutoff, this.beta));
  }

  updateFilterParams(sensitivity) {
    // Adjust filters dynamically based on accessibility sensitivity slider
    // Sensitivity ranges from 0.5x (slower response, more filtering) to 2.0x (faster response, less filtering)
    this.minCutoff = 0.5 * sensitivity;
    this.beta = 0.05 * sensitivity;
    
    for (let i = 0; i < 21; i++) {
      this.filtersX[i].mincutoff = this.minCutoff;
      this.filtersX[i].beta = this.beta;
      this.filtersY[i].mincutoff = this.minCutoff;
      this.filtersY[i].beta = this.beta;
    }
  }

  resetFilters() {
    for (let i = 0; i < 21; i++) {
      this.filtersX[i].reset();
      this.filtersY[i].reset();
    }
  }

  /**
   * Load MediaPipe Hands model
   */
  async initialize() {
    return new Promise((resolve, reject) => {
      try {
        if (typeof Hands === 'undefined') {
          throw new Error('MediaPipe Hands failed to load. Check your network connection.');
        }

        // Instantiate the MediaPipe hands model loaded from jsdelivr CDN
        this.hands = new Hands({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        this.hands.setOptions({
          maxNumHands: this.maxNumHands,
          modelComplexity: 1,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        this.hands.onResults((results) => {
          this.processResults(results);
        });

        this.isInitialized = true;
        resolve();
      } catch (err) {
        console.error('Failed to initialize MediaPipe Hands: ', err);
        reject(err);
      }
    });
  }

  /**
   * Start tracking process
   */
  async start() {
    if (!this.isInitialized) {
      await this.initialize();
    }
    this.resetFilters();
    this.isTracking = true;
    this.tickFrame();
  }

  /**
   * Stop tracking process
   */
  stop() {
    this.isTracking = false;
  }

  /**
   * One-hand mode vs. both hands (accessibility control).
   */
  setMaxHands(count) {
    this.maxNumHands = Math.max(1, Math.min(2, count));
    if (this.hands) {
      this.hands.setOptions({ maxNumHands: this.maxNumHands });
    }
    this.resetFilters();
  }

  /**
   * Which hand to track when more than one is visible (accessibility control).
   */
  setPreferredHand(hand) {
    const next = hand === 'left' ? 'left' : 'right';
    if (next !== this.preferredHand) {
      this.preferredHand = next;
      this.resetFilters(); // Avoid smoothing across a switch between hands
    }
  }

  /**
   * Pick which detected hand to drive the game with.
   */
  selectHandIndex(results) {
    const hands = results.multiHandLandmarks;
    if (!hands || hands.length === 0) return -1;
    if (hands.length === 1 || !results.multiHandedness) return 0;

    for (let i = 0; i < results.multiHandedness.length; i++) {
      const label = (results.multiHandedness[i].label || '').toLowerCase();
      const actual = this.HANDEDNESS_IS_FLIPPED
        ? (label === 'left' ? 'right' : 'left')
        : label;
      if (actual === this.preferredHand) return i;
    }

    return 0; // Preferred hand not visible - fall back to whatever is there
  }

  /**
   * Custom frame loop sending webcam frames sequentially to MediaPipe
   */
  tickFrame() {
    if (!this.isTracking || !this.hands) return;

    if (this.video.readyState >= 2) {
      this.hands.send({ image: this.video })
        .then(() => {
          if (this.isTracking) {
            requestAnimationFrame(() => this.tickFrame());
          }
        })
        .catch((err) => {
          console.error("Error sending frame to MediaPipe Hands:", err);
          if (this.isTracking) {
            requestAnimationFrame(() => this.tickFrame());
          }
        });
    } else {
      requestAnimationFrame(() => this.tickFrame());
    }
  }

  /**
   * Callback received from MediaPipe Hands
   */
  processResults(results) {
    const now = Date.now();
    const latency = now - this.lastFrameTime;
    this.lastFrameTime = now;

    let smoothedLandmarks = null;
    let rawLandmarks = null;

    const handIndex = this.selectHandIndex(results);

    if (handIndex >= 0) {
      rawLandmarks = results.multiHandLandmarks[handIndex];
      smoothedLandmarks = [];

      // Apply One-Euro filter to each landmark
      for (let i = 0; i < rawLandmarks.length; i++) {
        const rawPt = rawLandmarks[i];
        const smoothedX = this.filtersX[i].filter(rawPt.x, now);
        const smoothedY = this.filtersY[i].filter(rawPt.y, now);
        
        smoothedLandmarks.push({
          x: smoothedX,
          y: smoothedY,
          z: rawPt.z // Keep raw Z coordinate
        });
      }
    } else {
      this.resetFilters();
    }

    this.onResults({
      landmarks: smoothedLandmarks,
      rawLandmarks: rawLandmarks,
      latency: latency,
      handedness: handIndex >= 0 && results.multiHandedness
        ? results.multiHandedness[handIndex]
        : null
    });
  }
}
