/**
 * GestureForge App Coordinator (Refactored)
 * Connects Camera, Hand Tracker, Gesture Classifier, Game Loop, Analytics, and UI Panels.
 */
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Screen Router & Navigation
  const screens = {
    loading: document.getElementById('loading-screen'),
    menu: document.getElementById('menu-screen'),
    calibration: document.getElementById('calibration-screen'),
    game: document.getElementById('game-screen'),
    analytics: document.getElementById('analytics-screen'),
    settings: document.getElementById('settings-screen')
  };

  function activateScreen(screenKey) {
    Object.keys(screens).forEach(key => {
      if (screens[key]) {
        if (key === screenKey) {
          screens[key].classList.add('active');
        } else {
          screens[key].classList.remove('active');
        }
      }
    });

    // Special handlers when entering screens
    if (screenKey === 'menu' && menuController) {
      menuController.start();
    } else if (menuController) {
      menuController.stop();
    }
  }

  // Bind back buttons
  document.querySelectorAll('.back-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target') || 'menu';
      activateScreen(target);
    });
  });

  // 2. Initialize Core Systems
  const camera = new CyberCamera('webcam', 'skeleton-overlay');
  const classifier = new CyberGestureClassifier();
  
  // Initialize loader and load game engine on unity-canvas
  const loader = new UnityLoader('unity-canvas');
  const game = loader.load();

  const profiler = new PerformanceProfiler();
  const bridge = window.WebSocketBridge ? new WebSocketBridge() : null;

  // Initialize UI Controllers
  const menuController = new MainMenuController('menu-particles', (action) => {
    if (action === 'play') {
      activateScreen('game');
      startGameArena();
    } else if (action === 'calibrate') {
      activateScreen('calibration');
      startCalibrationFlow();
    } else if (action === 'analytics') {
      activateScreen('analytics');
    } else if (action === 'settings') {
      activateScreen('settings');
    }
  });

  const calibUI = new CalibrationController(
    () => { // Start Game
      activateScreen('game');
      startGameArena();
    },
    () => { // Recalibrate
      startCalibrationFlow();
    }
  );

  const hudUI = new HudController();
  const spellWheel = new SpellWheelController();
  const coachUI = new GestureCoachController();
  const minimap = new MinimapController('minimap-canvas');
  const analyticsUI = new AnalyticsUIController();

  const settingsUI = new SettingsPanelController(
    (key, val) => { // Setting changed callback
      if (key === 'dominantHand') {
        tracker.setPreferredHand(val);
      } else if (key === 'oneHandMode') {
        tracker.setMaxHands(val ? 1 : 2);
      } else if (key === 'mirrored') {
        camera.setMirror(val);
        classifier.setMirrored(val);
      } else if (key === 'sensitivity') {
        classifier.setSensitivity(val);
        tracker.updateFilterParams(val);
      }
    },
    () => { // Reset Profile callback
      classifier.resetCalibration();
      calibUI.setCalibratedState(false);
      menuController.updateProfile("Player_01", false);
    }
  );

  // 3. Hand Tracker setup
  let wristYHistory = [];
  let isCalibrating = false;
  let calibrationTimeout = null;

  const tracker = new CyberHandTracker(camera.video, (results) => {
    onTrackingFrame(results);
  });

  // Sync initial configuration options
  camera.setMirror(GF_CONFIG.ACCESSIBILITY.MIRRORED);
  classifier.setMirrored(GF_CONFIG.ACCESSIBILITY.MIRRORED);
  tracker.setPreferredHand(GF_CONFIG.ACCESSIBILITY.DOMINANT_HAND);
  tracker.setMaxHands(GF_CONFIG.ACCESSIBILITY.ONE_HAND_MODE ? 1 : 2);
  tracker.updateFilterParams(GF_CONFIG.ACCESSIBILITY.SENSITIVITY);

  // Load tracking library
  try {
    const statusText = document.getElementById('loader-text');
    const fill = document.getElementById('loader-fill');
    
    if (statusText) statusText.textContent = "Requesting Webcam Stream...";
    if (fill) fill.style.width = "40%";
    
    await camera.start();
    
    if (statusText) statusText.textContent = "Loading MediaPipe Hands...";
    if (fill) fill.style.width = "75%";
    
    await tracker.start();
    
    if (statusText) statusText.textContent = "Ready!";
    if (fill) fill.style.width = "100%";
    
    setTimeout(() => {
      activateScreen('menu');
    }, 800);
  } catch (err) {
    console.error(err);
    const statusText = document.getElementById('loader-text');
    if (statusText) statusText.textContent = `Camera Access Error: ${err.message}`;
  }

  // 4. Calibration Flow
  function startCalibrationFlow() {
    isCalibrating = true;
    classifier.resetCalibration();
    calibUI.setCalibratedState(false);
    runNextCalibrationStep();
  }

  function runNextCalibrationStep() {
    const step = classifier.calibrationSession.step;
    classifier.beginCalibrationStep();

    // Map step instructions
    const prompts = [
      GF_I18N.en.calibration.size,
      GF_I18N.en.calibration.pinch,
      GF_I18N.en.calibration.palm,
      GF_I18N.en.calibration.fist
    ];

    calibUI.updateStepProgress(step, 0);
    coachUI.setCoachMessage(prompts[step], '#fbbf24');
  }

  function endCalibrationWizard() {
    isCalibrating = false;
    calibUI.setCalibratedState(true);
    menuController.updateProfile("Player_01", true);
    coachUI.setCoachMessage(GF_I18N.en.calibration.complete, '#4ade80');
  }

  // 5. Game Loop & Frame tick callbacks
  function startGameArena() {
    wristYHistory = [];
    game.reset();
    game.start();
    coachUI.setCoachMessage("Arena loaded. Perform gestures to play!", '#4ade80');
  }

  function onTrackingFrame(results) {
    // Profiler tick
    profiler.tick();
    if (results.latency) profiler.logLatency(results.latency);

    const metrics = profiler.getMetrics();
    hudUI.updateFps(metrics.fps);

    // Draw Skeleton overlay
    if (results.landmarks) {
      camera.drawSkeleton(results.landmarks);
    } else {
      camera.clearCanvas();
    }

    // 1. Handle Calibration wizard input
    if (isCalibrating) {
      if (!results.landmarks) {
        coachUI.setCoachMessage("Hand lost! Align your hand in the frame to calibrate.", '#f87171');
        return;
      }
      const progress = classifier.processCalibrationFrame(results.landmarks);
      if (progress !== null) {
        const step = classifier.calibrationSession.step;
        calibUI.updateStepProgress(step, progress);
        
        if (progress >= 100) {
          if (classifier.advanceCalibrationStep()) {
            runNextCalibrationStep();
          } else {
            endCalibrationWizard();
          }
        }
      }
      return;
    }

    // Update active settings status inside calibration preview cards
    if (screens.calibration.classList.contains('active')) {
      const activeCheck = classifier.classify(results.landmarks);
      calibUI.updateConfidence(activeCheck.gesture, activeCheck.confidence);
    }

    // 2. Active Gameplay inputs
    if (!game.isRunning) return;

    if (!results.landmarks) {
      wristYHistory = [];
      coachUI.analyze(null, null, metrics.latency, 'None');
      hudUI.updateGestureStatus('Ready', 0);
      return;
    }

    const checkResult = classifier.classify(results.landmarks);
    let activeGesture = checkResult.gesture;
    let confidence = checkResult.confidence;
    const predictedX = checkResult.predictedX;

    // Wrist Jump heuristic
    const wrist = results.landmarks[0];
    wristYHistory.push(wrist.y);
    if (wristYHistory.length > 5) wristYHistory.shift();

    if (wristYHistory.length >= 3) {
      const dy = wristYHistory[wristYHistory.length - 1] - wristYHistory[0];
      if (dy < -0.15 && !game.player.isJumping) {
        activeGesture = 'Jump';
        confidence = 0.95;
        wristYHistory = [];
      }
    }

    // Send command to Unity wrapper/Game
    const commandPayload = JSON.stringify({
      gesture: activeGesture,
      confidence: confidence,
      predictedX: predictedX
    });
    window.UnityBridge.sendMessage('GameEngine', 'handleGestureInput', commandPayload);

    // Update HUD & Coach
    hudUI.updatePlayerStats(game.player);
    hudUI.updateGestureStatus(activeGesture, confidence);
    hudUI.updateCooldowns(game.cooldowns, game.SPELL_COOLDOWNS);

    coachUI.analyze(results.landmarks, results.rawLandmarks, metrics.latency, activeGesture);

    // Sync minimap radar
    minimap.update(game.player, game.enemies, game.projectiles);

    // Log to Dashboard
    if (activeGesture !== 'None') {
      analyticsUI.logGesture(activeGesture);
    }
    analyticsUI.updateMetrics(metrics, classifier.history.length);
  }

  // Keyboard fallbacks and controls
  const keyboardSpells = {
    '1': 'Pinch',
    '2': 'Open Palm',
    '3': 'Fist',
    '4': 'Circle'
  };

  window.addEventListener('keydown', (e) => {
    if (!game.isRunning) return;

    const step = 30;
    if (e.key === 'a' || e.key === 'ArrowLeft') {
      e.preventDefault();
      game.player.targetX = Math.max(20, game.player.targetX - step);
    } else if (e.key === 'd' || e.key === 'ArrowRight') {
      e.preventDefault();
      game.player.targetX = Math.min(game.width - 20, game.player.targetX + step);
    } else if (e.key === ' ' || e.key === 'w' || e.key === 'ArrowUp') {
      e.preventDefault();
      game.handleGestureInput('Jump', 1.0, undefined);
    } else if (e.key === 'Shift' || e.key === 's' || e.key === 'ArrowDown') {
      e.preventDefault();
      game.handleGestureInput('Swipe Right', 1.0, undefined);
    } else if (keyboardSpells[e.key]) {
      e.preventDefault();
      const spell = keyboardSpells[e.key];
      game.handleGestureInput(spell, 1.0, undefined);
      analyticsUI.logGesture(spell);
    } else if (e.key === 'Escape') {
      togglePauseMenu();
    }
  });

  // Pause menu control
  const pauseOverlay = document.getElementById('pause-overlay');
  const btnResume = document.getElementById('btn-resume');
  const btnRestart = document.getElementById('btn-restart');
  const btnQuit = document.getElementById('btn-quit');

  function togglePauseMenu() {
    if (!game.isRunning) return;
    
    if (pauseOverlay.classList.contains('active')) {
      pauseOverlay.classList.remove('active');
      game.start(); // resume engine loops
    } else {
      pauseOverlay.classList.add('active');
      game.stop(); // stop engine updates
      
      // Update statistics in Pause overlay
      const sessionTimeEl = document.getElementById('pause-time');
      const sessionAccuracyEl = document.getElementById('pause-accuracy');
      if (sessionTimeEl) sessionTimeEl.textContent = '00:45';
      if (sessionAccuracyEl) sessionAccuracyEl.textContent = '94%';
    }
  }

  if (btnResume) btnResume.addEventListener('click', togglePauseMenu);
  if (btnRestart) {
    btnRestart.addEventListener('click', () => {
      pauseOverlay.classList.remove('active');
      startGameArena();
    });
  }
  if (btnQuit) {
    btnQuit.addEventListener('click', () => {
      pauseOverlay.classList.remove('active');
      game.stop();
      activateScreen('menu');
    });
  }
});
