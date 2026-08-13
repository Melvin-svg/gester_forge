/**
 * GestureForge Accessibility & Guidance Text dictionary
 */
const GF_I18N = {
    en: {
        loading: {
            mediapipe: "Initializing MediaPipe...",
            webcam: "Requesting Webcam...",
            ready: "System Ready. Complete calibration to start the game."
        },
        calibration: {
            align: "Center your hand in the frame",
            size: "Hold your hand FLAT and OPEN to measure hand size",
            pinch: "👌 Hold index & thumb PINCH tightly for Fireball calibration",
            palm: "🖐️ Hold palm OPEN and FLAT for Shield calibration",
            fist: "✊ Clench your FIST tightly for Earth Slam calibration",
            complete: "Calibration Successful! Adaptive profiles loaded."
        },
        coach: {
            outOfView: "Hand out of view! Place your hand clearly in front of the camera.",
            highLatency: "High processing latency. Check CPU load or improve room lighting.",
            tooCloseEdge: "Hand too close to camera edge! Keep hand centered.",
            tooFar: "Hand too far! Move closer to the camera.",
            tooClose: "Hand too close! Move slightly back.",
            tooFast: "Hold hand steady. Too much rapid movement.",
            breakSuggestion: "Tip: Stand up and take a 2-minute stretch break to reduce fatigue.",
            success: "Great job! Casted {gesture}."
        }
    }
};
