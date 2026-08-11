/**
 * GestureForge App Coordinator
 * Connects Camera, Hand Tracker, Gesture Classifier, Game Loop, Analytics, and UI Event Handlers.
 */
document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const btnCalibrate = document.getElementById('btn-calibrate');
  const btnStartGame = document.getElementById('btn-start-game');
  const calibrationOverlay = document.getElementById('calibration-overlay');
  const calibrationPrompt = document.getElementById('calibration-prompt');
  const calibrationProgressFill = document.getElementById('calibration-progress-fill');
  const calibrationStepDots = document.querySelectorAll('#calibration-steps .step-dot');
  const selectHand = document.getElementById('select-hand');
  const toggleMirror = document.getElementById('toggle-mirror');
  const sliderSensitivity = document.getElementById('slider-sensitivity');
  const sensitivityValue = document.getElementById('sensitivity-value');
  const toggleOneHand = document.getElementById('toggle-onehand');
  const cameraStatusDot = document.getElementById('camera-status-dot');
  const cameraStatusText = document.getElementById('camera-status-text');
  const gameOverlay = document.getElementById('game-overlay');
  const btnSkipCalibration = document.getElementById('btn-skip-calibration');
  const minDistanceReadout = document.getElementById('min-distance-readout');
  const minDistanceValue = document.getElementById('min-distance-value');
  const pipCamera = document.getElementById('pip-camera');
  const pipDistanceFill = document.getElementById('pip-distance-fill');
  const pipDistanceMinMarker = document.getElementById('pip-distance-min-marker');
  const pipDistanceLabel = document.getElementById('pip-distance-label');

  // Hand-scale bounds (wrist-to-knuckle distance, as a fraction of frame
  // width) that the coach already uses to warn about distance. Reused here
  // to render an explicit min-distance readout instead of only reactive text.
  const HAND_SCALE_MIN = 0.06; // hand looks this small when too far away
  const HAND_SCALE_MAX = 0.22; // hand looks this big when too close
  const HAND_SCALE_BAR_RANGE = 0.30; // upper bound used to scale the PiP meter

  // Instantiate Modules
  const camera = new CyberCamera('webcam-video', 'tracking-canvas');
  const classifier = new CyberGestureClassifier();
  const game = new CyberGameEngine('game-canvas');
  const analytics = new CyberAnalytics('chart-latency', 'chart-distribution');
  const coach = new CyberCoach('coach-message', 'metric-fatigue');

  // Input states
  let wristYHistory = [];
  let isCalibrating = false;
  let stepStartTimeout = null;

  // Initialize camera and tracker
  const tracker = new CyberHandTracker(camera.video, (results) => {
    onTrackingFrame(results);
  });

  // Sync the initial UI control values into the modules
  camera.setMirror(toggleMirror.checked);
  classifier.setMirrored(toggleMirror.checked);
  tracker.setPreferredHand(selectHand.value);
  tracker.setMaxHands(toggleOneHand.checked ? 1 : 2);

  // Start Camera and Tracking
  try {
    cameraStatusText.innerText = "Requesting Webcam...";
    await camera.start();
    cameraStatusDot.classList.add('online');
    cameraStatusDot.classList.remove('warning');
    cameraStatusText.innerText = "Webcam Connected";

    // Start tracking loop
    await tracker.start();
    camera.setPipCanvas('pip-canvas');
    if (pipDistanceMinMarker) {
      pipDistanceMinMarker.style.left = `${(HAND_SCALE_MIN / HAND_SCALE_BAR_RANGE) * 100}%`;
    }
    coach.setCoachMessage("Camera active. Please complete calibration to unlock the game.", '#00f0ff');
  } catch (err) {
    cameraStatusDot.classList.add('warning');
    cameraStatusDot.classList.remove('online');
    cameraStatusText.innerText = "Camera Error";
    coach.setCoachMessage(
      err && err.message
        ? `Camera unavailable: ${err.message}`
        : "Camera access blocked. Please enable webcam in browser permissions.",
      '#ff3333'
    );
    console.error(err);
  }

  // 1. Accessibility Controls Listeners
  toggleMirror.addEventListener('change', (e) => {
    // Both the overlay drawing and the input mapping depend on this
    camera.setMirror(e.target.checked);
    classifier.setMirrored(e.target.checked);
  });

  sliderSensitivity.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    sensitivityValue.innerText = `${val.toFixed(1)}x`;
    classifier.setSensitivity(val);
    tracker.updateFilterParams(val);
  });

  selectHand.addEventListener('change', (e) => {
    tracker.setPreferredHand(e.target.value);
    coach.setCoachMessage(`Dominant hand switched to ${e.target.value.toUpperCase()}.`, '#00f0ff');
  });

  toggleOneHand.addEventListener('change', (e) => {
    const oneHand = e.target.checked;
    tracker.setMaxHands(oneHand ? 1 : 2);
    coach.setCoachMessage(
      oneHand
        ? "One-hand mode on. Only your dominant hand is tracked."
        : "Two-hand mode on. Your dominant hand still drives the game.",
      '#00f0ff'
    );
  });

  // 2. Calibration controls
  btnCalibrate.addEventListener('click', () => {
    startCalibrationWizard();
  });

  function startCalibrationWizard() {
    isCalibrating = true;
    btnCalibrate.disabled = true;
    calibrationOverlay.classList.add('active');

    classifier.resetCalibration();
    runNextCalibrationStep();
  }

  function endCalibrationWizard(message) {
    isCalibrating = false;
    clearTimeout(stepStartTimeout);
    classifier.calibrationSession.inProgress = false;
    calibrationOverlay.classList.remove('active');
    btnCalibrate.disabled = false;
    btnCalibrate.innerText = "Re-Calibrate";

    btnStartGame.disabled = false;
    btnStartGame.innerText = "Start Game";

    const overlayDesc = document.getElementById('overlay-desc');
    if (overlayDesc) overlayDesc.innerHTML = message;

    calibrationStepDots.forEach(dot => {
      dot.classList.remove('active');
      dot.classList.add('completed');
    });

    // Every gesture step passed calibration - surface the usable distance
    // range so the player knows where to stand before entering the arena.
    if (minDistanceReadout && minDistanceValue) {
      minDistanceValue.innerText = `${Math.round(HAND_SCALE_MIN * 100)}%–${Math.round(HAND_SCALE_MAX * 100)}% of frame width`;
      minDistanceReadout.style.display = 'flex';
    }
  }

  function runNextCalibrationStep() {
    const step = classifier.calibrationSession.step;

    // Update step dots
    calibrationStepDots.forEach((dot, idx) => {
      dot.classList.remove('active', 'completed');
      if (idx === step) {
        dot.classList.add('active');
      } else if (idx < step) {
        dot.classList.add('completed');
      }
    });

    const stepPrompts = [
      "Hold your hand FLAT and OPEN to measure hand size",
      "👌 Hold index & thumb PINCH tightly for Fireball calibration",
      "🖐️ Hold palm OPEN and FLAT for Shield calibration",
      "✊ Clench your FIST tightly for Earth Slam calibration"
    ];

    calibrationPrompt.innerText = stepPrompts[step];
    calibrationProgressFill.style.width = "0%";

    coach.setCoachMessage(
      `Get ready for Step ${step + 1}: ${step === 0 ? "Hand Size" : "Gesture Calibration"}.`,
      '#fff01f'
    );

    // Wait 1.5s for the user to get into position, then start recording frames
    clearTimeout(stepStartTimeout);
    stepStartTimeout = setTimeout(() => {
      if (!isCalibrating) return; // Wizard was cancelled or skipped meanwhile
      classifier.beginCalibrationStep();
      coach.setCoachMessage("Calibrating... Hold position steady!", '#fff01f');
    }, 1500);
  }

  // 3. Game controls
  btnStartGame.addEventListener('click', () => {
    gameOverlay.classList.remove('show');
    gameOverlay.classList.add('hide');
    wristYHistory = [];
    game.reset();
    game.start();
    if (pipCamera) pipCamera.classList.add('active');
    coach.setCoachMessage("Arena loaded. Spawn enemies! Use gestures to command.", '#39ff14');
  });

  if (btnSkipCalibration) {
    btnSkipCalibration.addEventListener('click', () => {
      classifier.resetCalibration();
      classifier.calibration.isCalibrated = true;
      endCalibrationWizard(
        "<strong>Calibration bypassed! Default AI values loaded.</strong><br>Click below to enter the battle arena."
      );
      coach.setCoachMessage("Calibration bypassed. AI defaults loaded. Click Start Game to play!", '#39ff14');
      btnSkipCalibration.style.display = 'none';
    });
  }

  /**
   * Main callback processing frame results from MediaPipe
   */
  function onTrackingFrame(results) {
    // Tick framerate calculations
    analytics.tickFps();

    // 1. Draw hand skeletal overlay on camera canvas
    if (results.landmarks) {
      camera.drawSkeleton(results.landmarks); // Clears the canvas itself
      analytics.logLatency(results.latency);
    } else {
      camera.clearCanvas();
      // If hand lost, log default latency jitter
      analytics.logLatency(12);
    }

    // 2. Handle calibration process if active
    if (isCalibrating) {
      handleCalibrationFrame(results);
      return; // Skip gameplay actions while calibrating
    }

    // 3. Handle active gameplay inputs
    if (!game.isRunning) return;

    // Keep the in-game PiP box (camera + hand skeleton) and its distance
    // meter live while playing, so the player never has to glance away from
    // the arena to see if their hand has drifted out of range.
    camera.drawPip(results.landmarks || null);
    updateDistanceMeter(results.landmarks || null);

    if (!results.landmarks) {
      // Clear stale motion state so the hand returning doesn't fire a phantom jump
      wristYHistory = [];
      coach.analyze(null, null, 12, 'None');
      return;
    }

    // Run gesture classification & wrist prediction
    const checkResult = classifier.classify(results.landmarks);
    let activeGesture = checkResult.gesture;
    let confidence = checkResult.confidence;
    const predictedX = checkResult.predictedX;

    // Handle vertical Wrist Jump detection
    const wrist = results.landmarks[0];
    wristYHistory.push(wrist.y);
    if (wristYHistory.length > 5) {
      wristYHistory.shift();
    }

    if (wristYHistory.length >= 3) {
      const oldestY = wristYHistory[0];
      const newestY = wristYHistory[wristYHistory.length - 1];
      const dy = newestY - oldestY;

      // Fast upward movement (Y decreases since 0 is top)
      if (dy < -0.15 && !game.player.isJumping) {
        activeGesture = 'Jump';
        confidence = 0.95;
        wristYHistory = []; // Reset to avoid multi-triggers
      }
    }

    // Feed input to game engine
    game.handleGestureInput(activeGesture, confidence, predictedX);

    // Log statistics to Analytics
    if (activeGesture !== 'None') {
      analytics.logGesture(activeGesture, confidence);
    }

    // Analyze metrics inside Gesture Coach (tips, lighting, fatigue indexes)
    coach.analyze(results.landmarks, results.rawLandmarks, results.latency, activeGesture);
  }

  /**
   * Update the PiP distance meter from the wrist-to-knuckle hand scale.
   * Mirrors the same too-close/too-far thresholds the coach uses so the bar
   * and the text warnings never disagree.
   */
  function updateDistanceMeter(landmarks) {
    if (!pipDistanceFill) return;

    if (!landmarks) {
      pipDistanceFill.style.width = '0%';
      pipDistanceFill.style.background = '#555';
      if (pipDistanceLabel) pipDistanceLabel.innerText = 'Hand Distance (no hand)';
      return;
    }

    const scale = Math.hypot(landmarks[0].x - landmarks[9].x, landmarks[0].y - landmarks[9].y);
    const pct = Math.max(0, Math.min(100, (scale / HAND_SCALE_BAR_RANGE) * 100));
    pipDistanceFill.style.width = `${pct}%`;

    if (scale < HAND_SCALE_MIN) {
      pipDistanceFill.style.background = '#fff01f';
      if (pipDistanceLabel) pipDistanceLabel.innerText = 'Too Far - Move Closer';
    } else if (scale > HAND_SCALE_MAX) {
      pipDistanceFill.style.background = '#ff3333';
      if (pipDistanceLabel) pipDistanceLabel.innerText = 'Too Close - Move Back';
    } else {
      pipDistanceFill.style.background = 'linear-gradient(90deg, #00f0ff, #39ff14)';
      if (pipDistanceLabel) pipDistanceLabel.innerText = 'Hand Distance (Good)';
    }
  }

  /**
   * Drive the calibration wizard. This function owns step advancement;
   * the classifier only measures and applies thresholds.
   */
  function handleCalibrationFrame(results) {
    if (!results.landmarks) {
      coach.setCoachMessage("Hand lost! Place your hand inside the frame to continue calibration.", '#ff3333');
      return;
    }

    const progress = classifier.processCalibrationFrame(results.landmarks);
    if (progress === null) return;

    calibrationProgressFill.style.width = `${progress}%`;
    if (progress < 100) return;

    // Step finished and its thresholds are applied - move on
    if (classifier.advanceCalibrationStep()) {
      runNextCalibrationStep();
      return;
    }

    // All calibration steps completed successfully
    endCalibrationWizard(
      "<strong>Calibration complete! AI models adapted successfully.</strong><br>Click below to enter the battle arena."
    );
    coach.setCoachMessage("Calibration successful! Click 'Start Game' to play.", '#39ff14');
  }

  // Handle keyboard fallback controls for debug / testing / accessibility
  const keyboardSpells = {
    '1': 'Pinch',
    '2': 'Open Palm',
    '3': 'Fist',
    '4': 'Circle'
  };

  window.addEventListener('keydown', (e) => {
    if (!game.isRunning) return;

    // Movement. `undefined` for predictedX leaves the target position alone,
    // so a spell key doesn't nudge the player sideways.
    const step = 30;
    if (e.key === 'a' || e.key === 'ArrowLeft') {
      e.preventDefault();
      game.player.targetX = Math.max(20, game.player.targetX - step);
      return;
    }
    if (e.key === 'd' || e.key === 'ArrowRight') {
      e.preventDefault();
      game.player.targetX = Math.min(game.width - 20, game.player.targetX + step);
      return;
    }

    // Jump
    if (e.key === ' ' || e.key === 'w' || e.key === 'ArrowUp') {
      e.preventDefault();
      game.handleGestureInput('Jump', 1.0, undefined);
      return;
    }

    // Dash
    if (e.key === 'Shift' || e.key === 's' || e.key === 'ArrowDown') {
      e.preventDefault();
      game.handleGestureInput('Swipe Right', 1.0, undefined);
      return;
    }

    // Spells
    const spell = keyboardSpells[e.key];
    if (spell) {
      e.preventDefault();
      game.handleGestureInput(spell, 1.0, undefined);
      analytics.logGesture(spell, 1.0);
    }
  });

  // Keep both the tracking overlay and the dashboard charts sized to their boxes
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      camera.resizeCanvas();
      analytics.resizeCanvas();
    }, 150);
  });
});
