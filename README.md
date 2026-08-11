# 🌌 GestureForge: AI-Powered Adaptive Gesture Gaming Framework

GestureForge is an advanced, client-side, AI-driven gesture gaming framework. Instead of merely mapping hand shapes to keyboard inputs, it is designed from the ground up to support natural hand interactions using camera inputs, client-side neural/landmark processing, and adaptive personalization algorithms.

---

## ✨ Features

- **Real-Time Hand Tracking:** Integrates MediaPipe Hands to process 21 3D landmarks directly from your webcam.
- **Adaptive Calibration:** Learns and fits to each player's hand morphology and lighting constraints through a structured wizard (Size, Pinch, Open Palm, Fist).
- **Temporal Filtering & Confidence Smoothing:** Reduces tracking jitter and filters momentary signal loss, preventing erratic movements.
- **Modern Cyberpunk UI:** Built with custom glassmorphic panels, glowing accents, cybernetic scanlines, and the premium "Outfit" typeface.
- **Accessibility & Customization:** Includes configuration settings for dominant-hand tracking (left vs. right), sensitivity, and distance alerts.

---

## 🏗️ Architecture

```
       Webcam Video Stream
               │
               ▼
     [ MediaPipe Hands SDK ]
               │
               ▼
      21 Landmark Joints
               │
               ▼
    [ Feature Extraction ] (Distance metrics, ratios, angles)
               │
               ▼
   [ Gesture Classifier ] (Confidence levels)
               │
               ▼
    [ Temporal Smoothing ] (Windowed averaging, hysteresis)
               │
               ▼
      [ Game Controller ] (Direct action mapping & gameplay loop)
```

---

## 📂 Project Structure

- `index.html` — The main entry point featuring the HUD, webcam tracker feed, calibration controls, and settings.
- `style.css` — Modern vanilla CSS implementing the cyberpunk theme, layouts, glassmorphic menus, and animations.
- `js/` — Core game and AI modules:
  - `handTracker.js` — Custom MediaPipe runner, landmark extraction, and frame-rate loop.
  - `gestureClassifier.js` — Processes joint distances/orientations to classify gestures with confidence indices.
  - `gameEngine.js` — The canvas-based rendering loop, collision detection, and mechanics.
  - `camera.js` — Handles webcam initialization, stream configuration, and fallback handling.
  - `analytics.js` — Logs user metrics, latency statistics, and performance charts.
  - `coach.js` — Real-time gesture training and tutorial feedback.
  - `app.js` — Main orchestrator bridging all modules together.
- `gestureforge-ui/` — Sub-project containing UI assets, screens, menus, and secondary modules.

---

## 🚀 How to Run Locally

Since the application uses webcam feeds and imports MediaPipe's runtime scripts asynchronously, it is recommended to run it using a local development server to bypass browser CORS policies.

### Option A: VS Code Live Server
1. Open this workspace in **VS Code**.
2. Click **Go Live** from the bottom status bar (using the Live Server extension).

### Option B: Python Simple HTTP Server
Run one of the following commands in the project directory:
```bash
# Python 3
python -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000
```
Then navigate to `http://localhost:8000` in your browser.

### Option C: Node.js (http-server)
If you have Node.js installed, run:
```bash
npx http-server . -p 8000
```
And open `http://localhost:8000` in your web browser.
