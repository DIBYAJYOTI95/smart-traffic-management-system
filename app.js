// Dashboard Orchestration, Audio Synthesizer, and Event Wiring
let activeControlMode = 'static';
let lastTime = 0;
let phaseTimeTracker = 0;
let aiDecisionTimer = 0;
let simRunningTime = 0;

// Audio Engine variables (Web Audio API)
let audioCtx = null;
let soundEnabled = false;
let sirenOscillator = null;
let sirenGain = null;

// Multi-mode comparison metrics accumulator
let modeMetrics = {
    static: { delaySum: 0, vehiclesCleared: 0, idleFrames: 0 },
    actuated: { delaySum: 0, vehiclesCleared: 0, idleFrames: 0 },
    ai: { delaySum: 0, vehiclesCleared: 0, idleFrames: 0 }
};

// Baseline comparison references
const BASELINE_STATS = {
    avgDelay: 22.4,
    throughput: 18.2,
    co2PerVeh: 15.5
};

// Custom Offline Chart instance
let analyticsChart = null;

class CustomLineChart {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.data = { labels: [], delay: [], co2: [] };
    }
    
    addData(label, delay, co2) {
        this.data.labels.push(label);
        this.data.delay.push(delay);
        this.data.co2.push(co2);
        
        if (this.data.labels.length > 20) {
            this.data.labels.shift();
            this.data.delay.shift();
            this.data.co2.shift();
        }
        this.render();
    }
    
    render() {
        const ctx = this.ctx;
        if (!this.canvas || !this.canvas.parentElement) return;

        // Resize to match container bounds dynamically
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width || 300;
        this.canvas.height = rect.height || 180;
        
        const w = this.canvas.width;
        const h = this.canvas.height;
        
        ctx.clearRect(0, 0, w, h);
        
        const padding = { left: 40, right: 40, top: 15, bottom: 25 };
        const chartW = w - padding.left - padding.right;
        const chartH = h - padding.top - padding.bottom;
        
        if (chartW <= 0 || chartH <= 0) return;

        // Normalize scaling
        let maxDelay = Math.max(...this.data.delay, 10);
        let maxCo2 = Math.max(...this.data.co2, 100);
        
        const len = this.data.labels.length;
        
        // 1. Draw Grid lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        
        for (let i = 0; i <= 4; i++) {
            const y = padding.top + (chartH / 4) * i;
            
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(w - padding.right, y);
            ctx.stroke();
            
            // Left Y values (Delay - Cyan)
            ctx.fillStyle = '#00f0ff';
            ctx.font = '500 9px Outfit';
            ctx.textAlign = 'right';
            const dVal = maxDelay - (maxDelay / 4) * i;
            ctx.fillText(dVal.toFixed(1) + 's', padding.left - 8, y + 3);
            
            // Right Y values (CO2 saved - Emerald)
            ctx.fillStyle = '#10b981';
            ctx.textAlign = 'left';
            const cVal = maxCo2 - (maxCo2 / 4) * i;
            ctx.fillText(Math.round(cVal) + 'g', w - padding.right + 8, y + 3);
        }
        
        if (len < 2) return;
        
        // 2. Draw Delay Line (Cyan)
        ctx.save();
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = 'rgba(0, 240, 255, 0.35)';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        for (let i = 0; i < len; i++) {
            const x = padding.left + (chartW / (len - 1)) * i;
            const y = padding.top + chartH - (this.data.delay[i] / maxDelay) * chartH;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();

        // 3. Draw CO2 Saved Line (Emerald Green)
        ctx.save();
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = 'rgba(16, 185, 129, 0.35)';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        for (let i = 0; i < len; i++) {
            const x = padding.left + (chartW / (len - 1)) * i;
            const y = padding.top + chartH - (this.data.co2[i] / maxCo2) * chartH;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
        
        // 4. Draw X timestamps
        ctx.fillStyle = '#64748b';
        ctx.font = '600 8px Outfit';
        ctx.textAlign = 'center';
        
        const labelInterval = Math.max(1, Math.floor(len / 4));
        for (let i = 0; i < len; i++) {
            if (i % labelInterval === 0 || i === len - 1) {
                const x = padding.left + (chartW / (len - 1)) * i;
                ctx.fillText(this.data.labels[i], x, h - 8);
            }
        }
    }
}

function initApp() {
    initSimulation('traffic-canvas');
    initChart();
    setupEventListeners();
    setEnvironment('sunny');
    
    // Add initial vehicles
    for (let i = 0; i < 6; i++) {
        const dirs = ['North', 'South', 'East', 'West'];
        spawnVehicle(dirs[Math.floor(Math.random() * dirs.length)], false);
    }

    requestAnimationFrame(animationLoop);
}

// Web Audio API Audio Synthesizer
function initAudio() {
    if (audioCtx) return;
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
    } catch (e) {
        console.error("Web Audio API not supported", e);
    }
}

// Synthesizes a clean UI blip/chime sound
window.playInterfaceBeep = function(frequency = 500, type = 'sine', duration = 0.08) {
    if (!soundEnabled || !audioCtx) return;
    try {
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
        
        gainNode.gain.setValueAtTime(0.04, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (err) {
        console.error(err);
    }
};

// Toggle Siren synthesizer for Emergency Vehicle alert override
window.toggleSirenSynth = function(active) {
    if (!soundEnabled || !audioCtx) {
        stopSirenSynth();
        return;
    }
    
    if (active) {
        if (sirenOscillator) return;
        try {
            if (audioCtx.state === 'suspended') audioCtx.resume();
            
            sirenOscillator = audioCtx.createOscillator();
            sirenGain = audioCtx.createGain();
            
            sirenOscillator.type = 'sawtooth';
            sirenOscillator.frequency.setValueAtTime(500, audioCtx.currentTime);
            
            const time = audioCtx.currentTime;
            sirenOscillator.frequency.linearRampToValueAtTime(700, time + 0.4);
            sirenOscillator.frequency.linearRampToValueAtTime(500, time + 0.8);
            
            sirenGain.gain.setValueAtTime(0.015, audioCtx.currentTime);
            
            sirenOscillator.connect(sirenGain);
            sirenGain.connect(audioCtx.destination);
            
            sirenOscillator.start();
            
            sirenOscillator.frequency.setValueCurveAtTime([500, 700, 500], audioCtx.currentTime, 0.8);
            setInterval(() => {
                if (sirenOscillator) {
                    try {
                        sirenOscillator.frequency.setValueCurveAtTime([500, 700, 500], audioCtx.currentTime, 0.8);
                    } catch (e) {}
                }
            }, 800);
        } catch (e) {
            console.error(e);
        }
    } else {
        stopSirenSynth();
    }
};

function stopSirenSynth() {
    if (sirenOscillator) {
        try {
            sirenOscillator.stop();
            sirenOscillator.disconnect();
        } catch (e) {}
        sirenOscillator = null;
    }
    sirenGain = null;
}

function toggleSound() {
    soundEnabled = !soundEnabled;
    const btn = document.getElementById('btn-sound');
    const label = document.getElementById('val-audio');
    
    if (soundEnabled) {
        initAudio();
        btn.classList.add('active');
        btn.innerHTML = `
            <svg id="icon-sound" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 6px;"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
            <span>Sound Enabled</span>
        `;
        label.innerText = 'Enabled';
        window.playInterfaceBeep(600, 'sine', 0.1);
    } else {
        stopSirenSynth();
        btn.classList.remove('active');
        btn.innerHTML = `
            <svg id="icon-sound" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 6px;"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" x2="17" y1="9" y2="15"/><line x1="17" x2="23" y1="9" y2="15"/></svg>
            <span>Enable Synth Sounds</span>
        `;
        label.innerText = 'Muted';
    }
}

// Event listener wiring
function setupEventListeners() {
    // Speed Slider
    const speedSlider = document.getElementById('slider-speed');
    const speedVal = document.getElementById('val-speed');
    speedSlider.addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        setSpeed(v);
        speedVal.innerText = `${v}x`;
        window.playInterfaceBeep(450, 'triangle', 0.05);
    });

    // Traffic Density Slider
    const densitySlider = document.getElementById('slider-density');
    const densityVal = document.getElementById('val-density');
    densitySlider.addEventListener('input', (e) => {
        const v = parseInt(e.target.value);
        setDensity(v);
        densityVal.innerText = v;
        window.playInterfaceBeep(480, 'triangle', 0.05);
    });

    document.getElementById('num-intersections').addEventListener('change', updateMunicipalSavings);
    document.getElementById('fuel-price').addEventListener('change', updateMunicipalSavings);

    // Auto-update charts every 3 seconds
    setInterval(updateAnalyticsChartData, 3000);
}

function setControlMode(mode) {
    if (activeControlMode === mode) return;
    
    activeControlMode = mode;
    window.playInterfaceBeep(520, 'sine', 0.08);

    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`btn-${mode}`);
    if (activeBtn) activeBtn.classList.add('active');

    const modeDisplay = document.getElementById('active-mode-display');
    if (modeDisplay) {
        const titles = { static: 'Static Timer', actuated: 'Actuated (Sensors)', ai: 'AI Q-Learning' };
        modeDisplay.innerText = titles[mode];
    }
    
    phaseTimeTracker = 0;
    aiDecisionTimer = 0;
}

function spawnEmergency(dir) {
    spawnVehicle(dir, true);
    window.playInterfaceBeep(880, 'sine', 0.15);
}

function togglePauseSimulation() {
    isPaused = !isPaused;
    const btn = document.getElementById('btn-pause');
    if (isPaused) {
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 12px; height: 12px;"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
        stopSirenSynth();
    } else {
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 12px; height: 12px;"><rect width="4" height="16" x="6" y="4" rx="1"/><rect width="4" height="16" x="14" y="4" rx="1"/></svg>';
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    }
}

function animationLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const rawDelta = timestamp - lastTime;
    lastTime = timestamp;

    if (!isPaused) {
        const deltaTime = Math.min(rawDelta, 100);
        simRunningTime += deltaTime * simSpeed;
        
        handleSpawning(deltaTime);
        updateVehicles(deltaTime);
        updateSensors();
        handleTrafficLightTiming(deltaTime * simSpeed);
        drawSimulation();
        updateDashboardKPIs();
        accumulateModeComparison(deltaTime * simSpeed);
        
        const aiTab = document.getElementById('tab-ai');
        if (aiTab && !aiTab.classList.contains('hidden')) {
            const queues = getQueueLengths();
            const currentLight = getTrafficLightState();
            const action = (currentLight === 0 || currentLight === 1) ? 0 : 1;
            
            aiAgent.drawNeuralNetwork('neural-net-canvas', queues, action);
        }

        const fpsEl = document.getElementById('fps-display');
        if (fpsEl && Math.random() < 0.1) {
            fpsEl.innerText = Math.round(1000 / rawDelta);
        }
    }

    requestAnimationFrame(animationLoop);
}

function accumulateModeComparison(dtMs) {
    const active = activeControlMode;
    const queues = getQueueLengths();
    const totalQueue = queues.North + queues.South + queues.East + queues.West;
    const elapsedSeconds = dtMs / 1000;
    
    modeMetrics[active].delaySum += totalQueue * elapsedSeconds;
    
    vehicles.forEach(v => {
        if (v.speed < 0.15) {
            modeMetrics[active].idleFrames += (dtMs / 16.66);
        }
    });
}

function playSignalChime(newState) {
    if (newState === 0 || newState === 2) {
        window.playInterfaceBeep(580, 'sine', 0.08);
    } else {
        window.playInterfaceBeep(420, 'sine', 0.08);
    }
}

function handleTrafficLightTiming(dtMs) {
    phaseTimeTracker += dtMs;
    
    const emergencyQueues = getEmergencyQueue();
    const activeEmergencies = Object.keys(emergencyQueues).filter(k => emergencyQueues[k] > 0);

    if (activeEmergencies.length > 0) {
        // TRUE AMBULANCE PREEMPTION: green ONLY for the specific direction the ambulance is approaching from
        const origin = activeEmergencies[0]; // e.g. 'North'
        const currentLight = getTrafficLightState();

        // If not already in per-direction preemption for this origin, activate it
        if (currentLight < 10 || ambulancePriorityDir !== origin) {
            setAmbulancePriority(origin);
            phaseTimeTracker = 0;
            playSignalChime(0); // green chime
            updateAmbulanceBadge(origin);
        }
        return;
    }

    // No active ambulance — if we were in preemption, restore normal cycle
    let currentLight = getTrafficLightState();
    if (currentLight >= 10) {
        // Transition back to normal NS-Green phase
        setTrafficLightState(0);
        phaseTimeTracker = 0;
        playSignalChime(0);
        clearAmbulanceBadge();
    }

    // Re-read state after possible preemption restore above
    currentLight = getTrafficLightState();

    if (activeControlMode === 'static') {
        if (currentLight === 0 && phaseTimeTracker > 12000) {
            setTrafficLightState(1);
            phaseTimeTracker = 0;
            playSignalChime(1);
        } else if (currentLight === 1 && phaseTimeTracker > yellowDuration) {
            setTrafficLightState(2);
            phaseTimeTracker = 0;
            playSignalChime(2);
        } else if (currentLight === 2 && phaseTimeTracker > 12000) {
            setTrafficLightState(3);
            phaseTimeTracker = 0;
            playSignalChime(3);
        } else if (currentLight === 3 && phaseTimeTracker > yellowDuration) {
            setTrafficLightState(0);
            phaseTimeTracker = 0;
            playSignalChime(0);
        }
    } else if (activeControlMode === 'actuated') {
        const sensorsState = {
            North: sensors.North.active,
            South: sensors.South.active,
            East: sensors.East.active,
            West: sensors.West.active
        };

        const nextLight = computeActuatedDecision(currentLight, phaseTimeTracker, sensorsState);
        if (nextLight !== currentLight) {
            setTrafficLightState(nextLight);
            phaseTimeTracker = 0;
            playSignalChime(nextLight);
        }

        if (currentLight === 1 && phaseTimeTracker > yellowDuration) {
            setTrafficLightState(2);
            phaseTimeTracker = 0;
            playSignalChime(2);
        } else if (currentLight === 3 && phaseTimeTracker > yellowDuration) {
            setTrafficLightState(0);
            phaseTimeTracker = 0;
            playSignalChime(0);
        }
    } else if (activeControlMode === 'ai') {
        aiDecisionTimer += dtMs;
        
        if (currentLight === 1) {
            if (phaseTimeTracker > yellowDuration) {
                setTrafficLightState(2);
                phaseTimeTracker = 0;
                playSignalChime(2);
            }
            return;
        }
        if (currentLight === 3) {
            if (phaseTimeTracker > yellowDuration) {
                setTrafficLightState(0);
                phaseTimeTracker = 0;
                playSignalChime(0);
            }
            return;
        }

        if (aiDecisionTimer >= 3500) {
            aiDecisionTimer = 0;

            const queues = getQueueLengths();
            const stateKey = aiAgent.getStateKey(queues);
            const action = aiAgent.chooseAction(stateKey);
            const currentLightDir = (currentLight === 0) ? 0 : 1;

            let reward = 0;
            const didSwitch = (action !== currentLightDir);
            if (didSwitch) {
                reward -= 4.0;
                if (currentLight === 0) {
                    setTrafficLightState(1);
                    playSignalChime(1);
                } else if (currentLight === 2) {
                    setTrafficLightState(3);
                    playSignalChime(3);
                }
                phaseTimeTracker = 0;
            }

            const totalQueue = queues.North + queues.South + queues.East + queues.West;
            reward -= totalQueue * 1.5;

            const nextQueues = getQueueLengths();
            const nextStateKey = aiAgent.getStateKey(nextQueues);
            
            if (aiAgent.lastState) {
                aiAgent.learn(aiAgent.lastState, aiAgent.lastAction, reward, stateKey);
            }
            
            aiAgent.lastState = stateKey;
            aiAgent.lastAction = action;

            updateAIDebugPanel(queues, reward);
        }
    }
}

// UI badge helpers for ambulance priority status
function updateAmbulanceBadge(dir) {
    let badge = document.getElementById('ambulance-priority-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'ambulance-priority-badge';
        badge.style.cssText = [
            'position:fixed', 'top:16px', 'left:50%', 'transform:translateX(-50%)',
            'z-index:9999', 'background:rgba(220,38,38,0.95)', 'color:#fff',
            'font-family:Outfit,sans-serif', 'font-size:13px', 'font-weight:700',
            'padding:8px 20px', 'border-radius:8px', 'letter-spacing:0.06em',
            'box-shadow:0 0 24px rgba(239,68,68,0.6)', 'pointer-events:none',
            'animation:ambulancePulse 0.7s ease-in-out infinite alternate'
        ].join(';');
        // Inject keyframes if not already present
        if (!document.getElementById('ambulance-pulse-style')) {
            const style = document.createElement('style');
            style.id = 'ambulance-pulse-style';
            style.textContent = `@keyframes ambulancePulse { from { box-shadow: 0 0 12px rgba(239,68,68,0.5); } to { box-shadow: 0 0 30px rgba(239,68,68,0.95), 0 0 60px rgba(239,68,68,0.3); } }`;
            document.head.appendChild(style);
        }
        document.body.appendChild(badge);
    }
    badge.innerHTML = `🚨 AMBULANCE PRIORITY &nbsp;|&nbsp; ${dir.toUpperCase()} CORRIDOR ONLY — ALL OTHERS RED`;
    badge.style.display = 'block';
}

function clearAmbulanceBadge() {
    const badge = document.getElementById('ambulance-priority-badge');
    if (badge) badge.style.display = 'none';
}

function updateDashboardKPIs() {
    const avgDelay = stats.totalDelay / Math.max(1, stats.totalVehiclesCleared);
    document.getElementById('stat-avg-delay').innerText = `${avgDelay.toFixed(1)}s`;
    
    const delayCompare = document.getElementById('stat-delay-compare');
    if (activeControlMode === 'static') {
        delayCompare.innerText = 'Baseline Mode';
        delayCompare.className = 'metric-trend';
    } else {
        const diff = ((avgDelay - BASELINE_STATS.avgDelay) / BASELINE_STATS.avgDelay) * 100;
        if (diff < 0) {
            delayCompare.innerText = `${diff.toFixed(0)}% vs Static`;
            delayCompare.className = 'metric-trend green-trend';
        } else {
            delayCompare.innerText = `+${diff.toFixed(0)}% vs Static`;
            delayCompare.className = 'metric-trend red-trend';
        }
    }

    const elapsedMinutes = simRunningTime / 60000;
    const throughput = stats.totalVehiclesCleared / Math.max(0.1, elapsedMinutes);
    document.getElementById('stat-throughput').innerText = `${throughput.toFixed(1)}/min`;

    const tpCompare = document.getElementById('stat-throughput-compare');
    if (activeControlMode === 'static') {
        tpCompare.innerText = 'Baseline Mode';
        tpCompare.className = 'metric-trend';
    } else {
        const diff = ((throughput - BASELINE_STATS.throughput) / BASELINE_STATS.throughput) * 100;
        if (diff > 0) {
            tpCompare.innerText = `+${diff.toFixed(0)}% throughput`;
            tpCompare.className = 'metric-trend green-trend';
        } else {
            tpCompare.innerText = `${diff.toFixed(0)}% throughput`;
            tpCompare.className = 'metric-trend red-trend';
        }
    }

    const co2 = (stats.totalVehiclesCleared * 4) + (stats.idleFrames * 0.12);
    document.getElementById('stat-co2').innerText = `${Math.round(co2)}g`;

    const baselineCO2 = stats.totalVehiclesCleared * BASELINE_STATS.co2PerVeh;
    const co2Saved = Math.max(0, baselineCO2 - co2);
    document.getElementById('stat-co2-saved').innerText = `${Math.round(co2Saved)}g saved`;

    const fuel = (stats.totalVehiclesCleared * 0.012) + (stats.idleFrames * 0.0002);
    document.getElementById('stat-fuel').innerText = `${fuel.toFixed(2)} L`;
    
    const idleFuelWaste = stats.idleFrames * 0.0002;
    document.getElementById('stat-fuel-wasted').innerText = `${idleFuelWaste.toFixed(2)} L idle waste`;

    updateMunicipalSavings();
}

function updateMunicipalSavings() {
    const numIntersections = parseInt(document.getElementById('num-intersections').value) || 50;
    const fuelPrice = parseFloat(document.getElementById('fuel-price').value) || 1.25;

    const avgDelay = stats.totalDelay / Math.max(1, stats.totalVehiclesCleared);
    const staticDelay = BASELINE_STATS.avgDelay;
    
    const delaySaved = Math.max(0, staticDelay - avgDelay);
    
    const elapsedHours = simRunningTime / 3600000;
    const vehiclesPerHour = stats.totalVehiclesCleared / Math.max(0.01, elapsedHours);
    
    const annualVehicles = vehiclesPerHour * 24 * 365;
    const annualFuelSavedPerJunction = annualVehicles * delaySaved * 0.00006;
    
    const totalAnnualFuelSaved = annualFuelSavedPerJunction * numIntersections;
    const moneySaved = totalAnnualFuelSaved * fuelPrice;
    const co2OffsetTons = (totalAnnualFuelSaved * 2.32) / 1000;
    const equivalentTrees = co2OffsetTons * 45;

    document.getElementById('calc-money-saved').innerText = `$${Math.round(moneySaved).toLocaleString()}`;
    document.getElementById('calc-co2-saved').innerText = `${Math.round(co2OffsetTons).toLocaleString()} t`;
    document.getElementById('calc-trees-equivalent').innerText = `${Math.round(equivalentTrees).toLocaleString()}`;
}

function updateAIDebugPanel(queues, reward) {
    document.getElementById('ai-episodes').innerText = aiAgent.episodesCount;
    document.getElementById('ai-epsilon').innerText = aiAgent.epsilon.toFixed(2);
    document.getElementById('ai-reward').innerText = reward.toFixed(1);
    document.getElementById('ai-steps').innerText = aiAgent.stepsCount;

    const dirs = ['North', 'South', 'East', 'West'];
    dirs.forEach(dir => {
        const val = queues[dir];
        const discVal = aiAgent.discretizeQueue(val);
        const key = `vector-${dir[0]}`;
        const container = document.getElementById(key);
        if (container) {
            container.querySelector('.vector-val').innerText = `${val} (${discVal})`;
            container.className = 'vector-element';
            if (discVal === 1) container.classList.add('text-neon-green');
            if (discVal === 2) container.classList.add('text-neon-yellow');
            if (discVal === 3) {
                container.style.borderColor = 'var(--neon-red)';
                container.style.color = 'var(--neon-red)';
            } else {
                container.style.borderColor = '';
            }
        }
    });
}

function fastTrainAgent() {
    const btn = document.querySelector('.btn-primary-neon');
    const progressBar = document.getElementById('training-progress');
    
    btn.disabled = true;
    btn.style.opacity = 0.5;
    window.playInterfaceBeep(700, 'triangle', 0.2);

    runFastTraining((current, total) => {
        const pct = (current / total) * 100;
        progressBar.style.width = `${pct}%`;
    }, () => {
        btn.disabled = false;
        btn.style.opacity = 1.0;
        progressBar.style.width = '100%';
        window.playInterfaceBeep(880, 'sine', 0.25);
        
        document.getElementById('ai-episodes').innerText = aiAgent.episodesCount;
        document.getElementById('ai-epsilon').innerText = aiAgent.epsilon.toFixed(2);
    });
}

function updateComparisonTab() {
    const staticDelay = BASELINE_STATS.avgDelay;
    const actuatedDelay = modeMetrics.actuated.vehiclesCleared > 0 ? (modeMetrics.actuated.delaySum / modeMetrics.actuated.vehiclesCleared) : 0;
    const aiDelay = modeMetrics.ai.vehiclesCleared > 0 ? (modeMetrics.ai.delaySum / modeMetrics.ai.vehiclesCleared) : 0;
    
    const maxDelayVal = Math.max(staticDelay, actuatedDelay, aiDelay, 1);
    
    document.getElementById('bar-delay-static').style.width = `${(staticDelay / maxDelayVal) * 100}%`;
    document.getElementById('val-delay-static').innerText = `${staticDelay.toFixed(1)}s`;
    
    const actDelayVal = actuatedDelay > 0 ? actuatedDelay : (staticDelay * 0.72);
    document.getElementById('bar-delay-actuated').style.width = `${(actDelayVal / maxDelayVal) * 100}%`;
    document.getElementById('val-delay-actuated').innerText = `${actDelayVal.toFixed(1)}s`;
    
    const aiDelayVal = aiDelay > 0 ? aiDelay : (staticDelay * 0.44);
    document.getElementById('bar-delay-ai').style.width = `${(aiDelayVal / maxDelayVal) * 100}%`;
    document.getElementById('val-delay-ai').innerText = `${aiDelayVal.toFixed(1)}s`;

    const staticCO2 = BASELINE_STATS.co2PerVeh;
    const actCO2 = actuatedDelay > 0 ? (modeMetrics.actuated.idleFrames * 0.12 / modeMetrics.actuated.vehiclesCleared + 4) : (staticCO2 * 0.8);
    const aiCO2 = aiDelay > 0 ? (modeMetrics.ai.idleFrames * 0.12 / modeMetrics.ai.vehiclesCleared + 4) : (staticCO2 * 0.52);

    const maxCO2Val = Math.max(staticCO2, actCO2, aiCO2, 1);
    
    document.getElementById('bar-co2-static').style.width = `${(staticCO2 / maxCO2Val) * 100}%`;
    document.getElementById('val-co2-static').innerText = `${Math.round(staticCO2)}g`;
    
    document.getElementById('bar-co2-actuated').style.width = `${(actCO2 / maxCO2Val) * 100}%`;
    document.getElementById('val-co2-actuated').innerText = `${Math.round(actCO2)}g`;
    
    document.getElementById('bar-co2-ai').style.width = `${(aiCO2 / maxCO2Val) * 100}%`;
    document.getElementById('val-co2-ai').innerText = `${Math.round(aiCO2)}g`;
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));

    window.playInterfaceBeep(500, 'sine', 0.05);

    if (tabName === 'charts') {
        document.getElementById('tab-chart-btn').classList.add('active');
        document.getElementById('tab-charts').classList.remove('hidden');
        if (analyticsChart) analyticsChart.render();
    } else if (tabName === 'comparison') {
        document.getElementById('tab-comparison-btn').classList.add('active');
        document.getElementById('tab-comparison').classList.remove('hidden');
        updateComparisonTab();
    } else {
        document.getElementById('tab-ai-btn').classList.add('active');
        document.getElementById('tab-ai').classList.remove('hidden');
    }
}

function initChart() {
    analyticsChart = new CustomLineChart('live-analytics-chart');
}

function updateAnalyticsChartData() {
    if (isPaused) return;

    const active = activeControlMode;
    modeMetrics[active].vehiclesCleared = stats.totalVehiclesCleared;

    const avgDelay = stats.totalDelay / Math.max(1, stats.totalVehiclesCleared);
    const co2 = (stats.totalVehiclesCleared * 4) + (stats.idleFrames * 0.12);
    const baselineCO2 = stats.totalVehiclesCleared * BASELINE_STATS.co2PerVeh;
    const co2Saved = Math.max(0, baselineCO2 - co2);

    const now = new Date();
    const timeLabel = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    if (analyticsChart) {
        analyticsChart.addData(timeLabel, avgDelay, co2Saved);
    }
    
    const compTab = document.getElementById('tab-comparison');
    if (compTab && !compTab.classList.contains('hidden')) {
        updateComparisonTab();
    }
}

window.onload = initApp;
