// Reinforcement Learning Traffic Controller (Tabular Q-learning Agent)
class QLearningAgent {
    constructor() {
        this.qTable = {}; // Key: "qN_qS_qE_qW", Value: [Q(action0), Q(action1)]
        this.actions = [0, 1]; // 0: N-S Green, 1: E-W Green
        this.learningRate = 0.12;
        this.discountFactor = 0.85;
        this.epsilon = 0.20;
        
        this.episodesCount = 0;
        this.stepsCount = 0;
        this.lastState = null;
        this.lastAction = null;
        this.lastReward = 0;

        // Visualizer weights configuration (fixed layout nodes coordinates for canvas)
        this.networkLayout = {
            inputs: [
                { label: 'Q-North', x: 30, y: 25 },
                { label: 'Q-South', x: 30, y: 55 },
                { label: 'Q-East', x: 30, y: 85 },
                { label: 'Q-West', x: 30, y: 115 }
            ],
            hidden: [
                { x: 140, y: 20 },
                { x: 140, y: 47 },
                { x: 140, y: 75 },
                { x: 140, y: 102 },
                { x: 140, y: 130 }
            ],
            outputs: [
                { label: 'N-S Phase', x: 250, y: 45 },
                { label: 'E-W Phase', x: 250, y: 105 }
            ]
        };
        
        // Random connection weights matrix for visual aesthetics
        this.weightsIH = Array.from({ length: 4 }, () => Array.from({ length: 5 }, () => Math.random() * 2 - 1));
        this.weightsHO = Array.from({ length: 5 }, () => Array.from({ length: 2 }, () => Math.random() * 2 - 1));
        this.pulseOffset = 0;
    }

    discretizeQueue(q) {
        if (q === 0) return 0;
        if (q <= 2) return 1;
        if (q <= 5) return 2;
        return 3;
    }

    getStateKey(queues) {
        const dN = this.discretizeQueue(queues.North);
        const dS = this.discretizeQueue(queues.South);
        const dE = this.discretizeQueue(queues.East);
        const dW = this.discretizeQueue(queues.West);
        return `${dN}_${dS}_${dE}_${dW}`;
    }

    getQValues(stateKey) {
        if (!this.qTable[stateKey]) {
            this.qTable[stateKey] = [0.0, 0.0];
        }
        return this.qTable[stateKey];
    }

    chooseAction(stateKey) {
        const qVals = this.getQValues(stateKey);
        if (Math.random() < this.epsilon) {
            return Math.floor(Math.random() * this.actions.length);
        } else {
            if (qVals[0] === qVals[1]) {
                const currentLight = getTrafficLightState();
                const currentLightDir = (currentLight === 0 || currentLight === 1) ? 0 : 1;
                return currentLightDir;
            }
            return qVals[0] > qVals[1] ? 0 : 1;
        }
    }

    learn(stateKey, action, reward, nextStateKey) {
        const qVals = this.getQValues(stateKey);
        const nextQVals = this.getQValues(nextStateKey);
        const maxNextQ = Math.max(nextQVals[0], nextQVals[1]);
        
        qVals[action] = qVals[action] + this.learningRate * (reward + this.discountFactor * maxNextQ - qVals[action]);
        this.stepsCount++;
        this.lastReward = reward;
    }

    // Canvas drawing function for the Neural Network architecture
    drawNeuralNetwork(canvasId, queues, chosenAction) {
        const c = document.getElementById(canvasId);
        if (!c) return;
        const nCtx = c.getContext('2d');
        nCtx.clearRect(0, 0, c.width, c.height);

        this.pulseOffset += 0.15;

        // Discretized queue values for input highlights
        const inputVals = [
            this.discretizeQueue(queues.North),
            this.discretizeQueue(queues.South),
            this.discretizeQueue(queues.East),
            this.discretizeQueue(queues.West)
        ];

        // Draw connections (Input to Hidden)
        for (let i = 0; i < this.networkLayout.inputs.length; i++) {
            const inp = this.networkLayout.inputs[i];
            const activeIn = inputVals[i] > 0;
            
            for (let j = 0; j < this.networkLayout.hidden.length; j++) {
                const hid = this.networkLayout.hidden[j];
                const weight = this.weightsIH[i][j];
                
                nCtx.strokeStyle = weight > 0 ? 'rgba(0, 240, 255, 0.08)' : 'rgba(168, 85, 247, 0.08)';
                if (activeIn) {
                    nCtx.strokeStyle = weight > 0 ? 'rgba(0, 240, 255, 0.22)' : 'rgba(168, 85, 247, 0.22)';
                }
                
                nCtx.lineWidth = Math.abs(weight) * 2;
                nCtx.beginPath();
                nCtx.moveTo(inp.x, inp.y);
                nCtx.lineTo(hid.x, hid.y);
                nCtx.stroke();
                
                // Draw flowing signal pulses on active paths
                if (activeIn && Math.random() < 0.15) {
                    const t = (this.pulseOffset % 10) / 10;
                    const px = inp.x + (hid.x - inp.x) * t;
                    const py = inp.y + (hid.y - inp.y) * t;
                    nCtx.fillStyle = 'rgba(0, 240, 255, 0.7)';
                    nCtx.beginPath();
                    nCtx.arc(px, py, 1.5, 0, Math.PI*2);
                    nCtx.fill();
                }
            }
        }

        // Draw connections (Hidden to Output)
        for (let i = 0; i < this.networkLayout.hidden.length; i++) {
            const hid = this.networkLayout.hidden[i];
            for (let j = 0; j < this.networkLayout.outputs.length; j++) {
                const out = this.networkLayout.outputs[j];
                const weight = this.weightsHO[i][j];
                const activeOut = chosenAction === j;

                nCtx.strokeStyle = activeOut ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.04)';
                nCtx.lineWidth = Math.abs(weight) * 2;
                nCtx.beginPath();
                nCtx.moveTo(hid.x, hid.y);
                nCtx.lineTo(out.x, out.y);
                nCtx.stroke();
            }
        }

        // Draw Nodes
        // Input Nodes
        this.networkLayout.inputs.forEach((inp, idx) => {
            const val = inputVals[idx];
            nCtx.fillStyle = val > 0 ? (val === 3 ? '#ff3838' : '#00f0ff') : '#1e293b';
            nCtx.beginPath();
            nCtx.arc(inp.x, inp.y, 5, 0, Math.PI * 2);
            nCtx.fill();
            
            // Halo glow for high values
            if (val > 1) {
                nCtx.shadowColor = nCtx.fillStyle;
                nCtx.shadowBlur = 8;
                nCtx.beginPath();
                nCtx.arc(inp.x, inp.y, 3, 0, Math.PI * 2);
                nCtx.fill();
                nCtx.shadowBlur = 0;
            }

            // Label
            nCtx.fillStyle = '#64748b';
            nCtx.font = '600 7px Outfit';
            nCtx.fillText(inp.label, inp.x - 25, inp.y + 2.5);
        });

        // Hidden Nodes
        this.networkLayout.hidden.forEach(hid => {
            nCtx.fillStyle = '#475569';
            nCtx.beginPath();
            nCtx.arc(hid.x, hid.y, 4, 0, Math.PI * 2);
            nCtx.fill();
        });

        // Output Nodes
        this.networkLayout.outputs.forEach((out, idx) => {
            const active = chosenAction === idx;
            nCtx.fillStyle = active ? '#10b981' : '#1e293b';
            nCtx.beginPath();
            nCtx.arc(out.x, out.y, 7, 0, Math.PI * 2);
            nCtx.fill();
            
            if (active) {
                nCtx.shadowColor = '#10b981';
                nCtx.shadowBlur = 10;
                nCtx.beginPath();
                nCtx.arc(out.x, out.y, 4, 0, Math.PI * 2);
                nCtx.fill();
                nCtx.shadowBlur = 0;
            }

            nCtx.fillStyle = active ? '#10b981' : '#64748b';
            nCtx.font = '700 8px Outfit';
            nCtx.fillText(out.label, out.x + 12, out.y + 2.5);
        });
    }
}

const aiAgent = new QLearningAgent();

// Heuristic Rules Module: Actuated Sensor Control
function computeActuatedDecision(currentLightState, timeInState, sensorStates) {
    const nsGreen = (currentLightState === 0);
    const ewGreen = (currentLightState === 2);
    
    if (!nsGreen && !ewGreen) return currentLightState;

    const nsActive = sensorStates.North || sensorStates.South;
    const ewActive = sensorStates.East || sensorStates.West;

    if (nsGreen) {
        if (ewActive && (!nsActive || timeInState > 15000)) {
            return 1; // Transition to NS Yellow
        }
    } else if (ewGreen) {
        if (nsActive && (!ewActive || timeInState > 15000)) {
            return 3; // Transition to EW Yellow
        }
    }
    
    return currentLightState;
}

// Fast Offline training simulation
function runFastTraining(progressCallback, completeCallback) {
    let episode = 0;
    const maxEpisodes = 100;
    const trainingInterval = setInterval(() => {
        if (episode >= maxEpisodes) {
            clearInterval(trainingInterval);
            aiAgent.episodesCount += maxEpisodes;
            aiAgent.epsilon = Math.max(0.04, aiAgent.epsilon - 0.08);
            completeCallback();
            return;
        }

        let qN = 0, qS = 0, qE = 0, qW = 0;
        let currentPhase = 0;
        let phaseTimer = 0;
        
        let stateKey = aiAgent.getStateKey({ North: qN, South: qS, East: qE, West: qW });

        for (let tick = 0; tick < 200; tick++) {
            if (Math.random() < 0.25) qN++;
            if (Math.random() < 0.25) qS++;
            if (Math.random() < 0.25) qE++;
            if (Math.random() < 0.25) qW++;

            const action = aiAgent.chooseAction(stateKey);
            
            let reward = 0;
            let changed = (action !== currentPhase);
            if (changed) {
                currentPhase = action;
                phaseTimer = 0;
                reward -= 5;
            }

            phaseTimer++;
            if (phaseTimer > 1) {
                if (currentPhase === 0) {
                    if (qN > 0) qN = Math.max(0, qN - (Math.random() < 0.7 ? 1 : 0));
                    if (qS > 0) qS = Math.max(0, qS - (Math.random() < 0.7 ? 1 : 0));
                } else {
                    if (qE > 0) qE = Math.max(0, qE - (Math.random() < 0.7 ? 1 : 0));
                    if (qW > 0) qW = Math.max(0, qW - (Math.random() < 0.7 ? 1 : 0));
                }
            }

            const totalQueue = qN + qS + qE + qW;
            reward -= totalQueue * 1.5;

            const nextStateKey = aiAgent.getStateKey({ North: qN, South: qS, East: qE, West: qW });
            aiAgent.learn(stateKey, action, reward, nextStateKey);
            stateKey = nextStateKey;
        }

        episode++;
        progressCallback(episode, maxEpisodes);
    }, 8);
}
