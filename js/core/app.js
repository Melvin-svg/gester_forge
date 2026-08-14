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

    if (screenKey !== 'calibration') {
      isCalibrating = false;
      calibLockedHand = null;
    }

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
  camera.setPreviewElement('game-camera-preview');
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

  function updateCustomGesturesSettingsList() {
    const customInfo = classifier.calibration.customGestures || {};
    settingsUI.renderCustomGestures(customInfo, (nameToRemove) => {
      classifier.removeCustomGesture(nameToRemove);
      updateCustomGesturesSettingsList();
      removeCustomGestureFromChecklistDOM(nameToRemove);
    });
  }

  function addCustomGestureToChecklistDOM(name) {
    const checklist = document.getElementById('gesture-checklist');
    if (!checklist) return;

    if (document.querySelector(`#gesture-checklist .check-item[data-gesture="${name}"]`)) return;

    const item = document.createElement('div');
    item.className = 'check-item';
    item.setAttribute('data-gesture', name);
    item.innerHTML = `
      <span class="check-icon">✓</span>
      <span class="check-label">${name}</span>
      <span class="check-status">Not tested</span>
    `;
    checklist.appendChild(item);

    calibUI.checklistItems[name] = item;
  }

  function removeCustomGestureFromChecklistDOM(name) {
    const item = document.querySelector(`#gesture-checklist .check-item[data-gesture="${name}"]`);
    if (item) {
      item.remove();
    }
    delete calibUI.checklistItems[name];
  }

  const settingsUI = new SettingsPanelController(
    (key, val) => { // Setting changed callback
      if (key === 'dominantHand') {
        tracker.setPreferredHand(val);
        if (val !== 'both') {
          classifier.setActiveHand(val);
        }
      } else if (key === 'oneHandMode') {
        tracker.setMaxHands(val ? 1 : 2);
      } else if (key === 'mirrored') {
        camera.setMirror(val);
        classifier.setMirrored(val);
      } else if (key === 'sensitivity') {
        classifier.setSensitivity(val);
        tracker.updateFilterParams(val);
      } else if (key === 'addCustomGesture') {
        classifier.addCustomGesture(val.name, val.action);
        updateCustomGesturesSettingsList();
        addCustomGestureToChecklistDOM(val.name);
      }
    },
    () => { // Reset Profile callback
      classifier.resetAllCalibrations();
      calibUI.setCalibratedState(false);
      menuController.updateProfile("Player_01", false, classifier.activeHand);
      updateCustomGesturesSettingsList();
    }
  );

  // 3. Hand Tracker setup
  let wristYHistory = [];
  let calibWristYHistory = [];
  let isCalibrating = false;
  let calibLockedHand = null;
  let detectedHandHistory = [];
  let calibrationTimeout = null;

  const CHECKLIST_GESTURE_MAP = {
    'Open Palm': 'open_palm',
    'Pinch': 'pinch',
    'Fist': 'fist',
    'Swipe Left': 'swipe',
    'Swipe Right': 'swipe',
    'Circle': 'circle',
    'Jump': 'raise'
  };

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
    
    // Initialize custom gestures settings list on load
    updateCustomGesturesSettingsList();

    setTimeout(() => {
      activateScreen('menu');
    }, 800);
  } catch (err) {
    console.error(err);
    const statusText = document.getElementById('loader-text');
    if (statusText) statusText.textContent = `Camera Access Error: ${err.message}`;
  }

  // Sustained-hold counters: require a gesture to be detected for several
  // consecutive frames before it gets verified on the checklist.  This stops
  // borderline classifications from ticking off multiple items at once.
  const CHECKLIST_HOLD_REQUIRED = 3;  // consecutive frames needed
  let checklistHoldGesture = null;
  let checklistHoldCount = 0;

  // Continuously classifies the live hand pose and ticks off the gesture
  // checklist, regardless of which step the calibration wizard is on.
  function updateGestureChecklist(landmarks) {
    const activeCheck = classifier.classify(landmarks);
    calibUI.updateConfidence(activeCheck.gesture, activeCheck.confidence);

    let checklistGesture = activeCheck.gesture;
    let checklistConfidence = activeCheck.confidence;

    // Wrist Jump heuristic (mirrors gameplay loop; classify() doesn't detect raises)
    const wrist = landmarks[0];
    const now = Date.now();
    calibWristYHistory.push({ y: wrist.y, time: now });
    // Keep only frames from the last 300ms, and max 5 frames
    calibWristYHistory = calibWristYHistory.filter(f => now - f.time < 300).slice(-5);

    if (calibWristYHistory.length >= 3) {
      const dy = calibWristYHistory[calibWristYHistory.length - 1].y - calibWristYHistory[0].y;
      // Camera Y decreases while a hand is raised. This threshold is above
      // normal smoothing jitter without requiring an exaggerated movement.
      if (dy < -0.045) {
        checklistGesture = 'Jump';
        checklistConfidence = 0.95;
        calibWristYHistory = []; // Clear on success
      }
    }

    if (checklistConfidence >= 0.6) {
      const checklistKey = CHECKLIST_GESTURE_MAP[checklistGesture] || checklistGesture;
      if (checklistKey) {
        calibUI.setGestureDetecting(checklistKey);
        // Temporal gestures (swipe, circle, jump) verify instantly — they
        // already require a specific motion trajectory so a hold is redundant.
        const isTemporalGesture = ['Swipe Left', 'Swipe Right', 'Circle', 'Jump'].includes(checklistGesture);

        if (isTemporalGesture) {
          calibUI.markGestureVerified(checklistKey);
          checklistHoldGesture = null;
          checklistHoldCount = 0;
        } else {
          // Static gestures need sustained detection
          if (checklistGesture === checklistHoldGesture) {
            checklistHoldCount++;
          } else {
            checklistHoldGesture = checklistGesture;
            checklistHoldCount = 1;
          }

          if (checklistHoldCount >= CHECKLIST_HOLD_REQUIRED) {
            calibUI.markGestureVerified(checklistKey);
            // Reset so the same gesture won't keep re-triggering immediately
            checklistHoldGesture = null;
            checklistHoldCount = 0;
          }
        }
      }
    } else {
      // Confidence dropped — reset the hold counter
      checklistHoldGesture = null;
      checklistHoldCount = 0;
      calibUI.clearGestureDetecting();
    }
  }

  // 4. Calibration Flow
  function startCalibrationFlow() {
    isCalibrating = true;
    calibLockedHand = null;
    classifier.resetCalibration();
    classifier.history = [];
    calibWristYHistory = [];
    checklistHoldGesture = null;
    checklistHoldCount = 0;
    calibUI.resetChecklist();
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

    let promptText = prompts[step];
    let customName = null;

    if (step > 3) {
      const customList = classifier.getCustomGesturesList();
      customName = customList[step - 4];
      const customInfo = classifier.calibration.customGestures[customName];
      promptText = `Hold your custom gesture "${customName}" (mapped to ${customInfo.mappedAction}) steady in front of the camera...`;
    }

    calibUI.updateStepProgress(step, 0, classifier.activeHand, customName);
    coachUI.setCoachMessage(promptText, '#fbbf24');
  }

  function endCalibrationWizard() {
    isCalibrating = false;
    calibLockedHand = null;
    calibUI.setCalibratedState(true);
    menuController.updateProfile("Player_01", true, classifier.activeHand);
    coachUI.setCoachMessage(GF_I18N.en.calibration.complete, '#4ade80');
  }

  // 5. Game Loop & Frame tick callbacks
  function startGameArena() {
    wristYHistory = [];
    classifier.history = [];
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

    // Auto-detect hand side (left vs right) and switch active calibration profile
    if (results.landmarks && results.handedness) {
      const rawLabel = (results.handedness.label || '').toLowerCase();
      const detectedHand = tracker.HANDEDNESS_IS_FLIPPED
        ? (rawLabel === 'left' ? 'right' : 'left')
        : rawLabel;

      if (detectedHand && (detectedHand === 'left' || detectedHand === 'right')) {
        detectedHandHistory.push(detectedHand);
        if (detectedHandHistory.length > 5) {
          detectedHandHistory.shift();
        }

        const isConsistent = detectedHandHistory.length >= 5 && detectedHandHistory.every(h => h === detectedHand);

        if (isConsistent) {
          let shouldSwitch = false;
          if (isCalibrating) {
            if (!calibLockedHand) {
              calibLockedHand = detectedHand;
              shouldSwitch = true;
            }
          } else {
            shouldSwitch = true;
          }

          if (shouldSwitch && classifier.activeHand !== detectedHand) {
            classifier.setActiveHand(detectedHand);
            tracker.setPreferredHand(detectedHand);

            // Update Settings selection UI
            settingsUI.updateHandSelection(detectedHand);

            // Update Calibration UI
            calibUI.updateDominantHand(detectedHand);
            calibUI.setCalibratedState(classifier.calibration.isCalibrated);

            // Update Main Menu profile text
            menuController.updateProfile("Player_01", classifier.calibration.isCalibrated, detectedHand);

            if (isCalibrating) {
              // Inform the user through the coach overlay
              coachUI.setCoachMessage(`Auto-detected ${detectedHand} hand. Calibrating ${detectedHand} hand...`, '#fbbf24');
            }
          }
        }
      }
    } else {
      detectedHandHistory = [];
    }

    // Live gesture checklist: runs continuously on the calibration screen,
    // independent of (and concurrently with) the step-by-step wizard below,
    // so users can verify Swipe/Circle/Jump while also calibrating Size/Pinch/Palm/Fist.
    if (screens.calibration.classList.contains('active')) {
      if (results.landmarks) {
        updateGestureChecklist(results.landmarks);
      } else {
        calibWristYHistory = [];
      }
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
        let customName = null;
        if (step > 3) {
          const customList = classifier.getCustomGesturesList();
          customName = customList[step - 4];
        }
        calibUI.updateStepProgress(step, progress, classifier.activeHand, customName);

        if (progress >= 100) {
          const calibratedGestureKeys = [null, 'pinch', 'open_palm', 'fist'];
          let calibratedKey = calibratedGestureKeys[step];
          if (step > 3) {
            calibratedKey = customName;
          }
          if (calibratedKey) calibUI.markGestureVerified(calibratedKey);
          if (classifier.advanceCalibrationStep()) {
            runNextCalibrationStep();
          } else {
            endCalibrationWizard();
          }
        }
      }
      return;
    }

    // 2. Active Gameplay inputs
    if (!game.isRunning) return;

    if (!results.landmarks) {
      coachUI.analyze(null, null, metrics.latency, 'None');
      hudUI.updateGestureStatus('Ready', 0);
      return;
    }

    const checkResult = classifier.classify(results.landmarks);
    let activeGesture = checkResult.gesture;
    let confidence = checkResult.confidence;
    const predictedX = checkResult.predictedX;

    // Translate custom gesture to mapped action for the game
    let gameGesture = activeGesture;
    const customGestureInfo = classifier.calibration.customGestures?.[activeGesture];
    if (customGestureInfo) {
      gameGesture = customGestureInfo.mappedAction;
    }

    // Wrist Jump heuristic
    const wrist = results.landmarks[0];
    const now = Date.now();
    wristYHistory.push({ y: wrist.y, time: now });
    // Keep only frames from the last 300ms, and max 5 frames
    wristYHistory = wristYHistory.filter(f => now - f.time < 300).slice(-5);

    if (wristYHistory.length >= 3) {
      const dy = wristYHistory[wristYHistory.length - 1].y - wristYHistory[0].y;
      if (dy < -0.045 && !game.player.isJumping) {
        activeGesture = 'Jump';
        gameGesture = 'Jump';
        confidence = 0.95;
        wristYHistory = [];
      }
    }

    // Send command to Unity wrapper/Game
    const commandPayload = JSON.stringify({
      gesture: gameGesture,
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
    if (!game.isRunning || !pauseOverlay) return;
    
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
