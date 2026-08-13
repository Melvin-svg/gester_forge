/**
 * GestureForge Global Configurations
 * Stores engine, tracking, and UI configuration constants.
 */
const GF_CONFIG = {
    VERSION: '1.0.4-alpha',
    
    // Spell configurations & cooldowns (ms)
    SPELLS: {
        'open_palm': { name: 'Shield', cooldown: 1500, icon: '🖐️' },
        'pinch': { name: 'Fireball', cooldown: 350, icon: '👌' },
        'swipe': { name: 'Dash', cooldown: 500, icon: '👉' },
        'fist': { name: 'Earth Slam', cooldown: 900, icon: '✊' },
        'circle': { name: 'Ice Spell', cooldown: 2500, icon: '💫' },
        'raise': { name: 'Jump', cooldown: 0, icon: '🖐️' }
    },

    // Calibration settings
    CALIBRATION: {
        FRAMES_REQUIRED: 40, // samples per step
        GAP_MIN: 0.12,       // gap between fist and palm curl threshold
        STEP_NAMES: ['Size', 'Pinch', 'Palm', 'Fist']
    },

    // Accessibility defaults
    ACCESSIBILITY: {
        DOMINANT_HAND: 'right',
        ONE_HAND_MODE: true,
        MIRRORED: true,
        SENSITIVITY: 1.0,
        CONFIDENCE_THRESHOLD: 0.85
    },

    // Jitter Filtering parameters
    FILTER: {
        MIN_CUTOFF: 0.5,
        BETA: 0.05
    }
};
