// Intelligent 4-Way Traffic Simulation Engine
let canvas, ctx;
let simSpeed = 1;
let globalSpawnRate = 20; // vehicles per minute
let isPaused = false;
let environmentWeather = 'sunny'; // 'sunny', 'rainy', 'night'

// Lists of active entities
let vehicles = [];
let particles = [];
let pedestrians = [];
let rainDrops = [];

// Color Palette for Simulation Elements
const Colors = {
    asphalt: '#1a1b24',
    grass: '#090a0f',
    marking: 'rgba(255, 255, 255, 0.12)',
    yellowLine: '#d97706',
    lightRed: '#ef4444',
    lightYellow: '#fbbf24',
    lightGreen: '#10b981',
    sensorActive: 'rgba(0, 240, 255, 0.25)',
    sensorInactive: 'rgba(255, 255, 255, 0.03)',
};

// Intersection Configuration
const roadWidth = 160;
const halfRoad = roadWidth / 2;
const stopLineOffset = 95; // distance from center to stop line

// Lanes setup (Right-hand traffic)
const Directions = {
    NORTH: {
        name: 'North',
        dx: 0, dy: 1, // moving down
        stopX: 350 - 40, stopY: 350 - stopLineOffset,
        lanes: [350 - 60, 350 - 20], // lane x-coords
        lightIndex: 0
    },
    SOUTH: {
        name: 'South',
        dx: 0, dy: -1, // moving up
        stopX: 350 + 40, stopY: 350 + stopLineOffset,
        lanes: [350 + 60, 350 + 20], // lane x-coords
        lightIndex: 0
    },
    EAST: {
        name: 'East',
        dx: -1, dy: 0, // moving left
        stopX: 350 + stopLineOffset, stopY: 350 - 40,
        lanes: [350 - 60, 350 - 20], // lane y-coords
        lightIndex: 1
    },
    WEST: {
        name: 'West',
        dx: 1, dy: 0, // moving right
        stopX: 350 - stopLineOffset, stopY: 350 + 40,
        lanes: [350 + 60, 350 + 20], // lane y-coords
        lightIndex: 1
    }
};

// Traffic Light State
// Normal cycle: 0=NS-Green, 1=NS-Yellow, 2=EW-Green, 3=EW-Yellow
// Ambulance preemption: 10=North-only Green, 11=South-only Green, 12=East-only Green, 13=West-only Green
let trafficLightState = 0;
let ambulancePriorityDir = null; // 'North','South','East','West' or null
const yellowDuration = 3000;

// Stats counters
let stats = {
    totalVehiclesSpawned: 0,
    totalVehiclesCleared: 0,
    totalDelay: 0,
    currentDelaySum: 0,
    idleFrames: 0,
    fuelWasted: 0,
    co2Emitted: 0,
    co2Saved: 0,
    history: {
        timestamp: [],
        avgDelay: [],
        throughput: [],
        co2: []
    }
};

let sensors = {
    North: { active: false, x: 350 - 80, y: 350 - 220, w: 80, h: 100 },
    South: { active: false, x: 350, y: 350 + 120, w: 80, h: 100 },
    East: { active: false, x: 350 + 120, y: 350 - 80, w: 100, h: 80 },
    West: { active: false, x: 350 - 220, y: 350, w: 100, h: 80 }
};

// Pedestrian Class Definition
class Pedestrian {
    constructor(crosswalk) {
        // crosswalk: 'North', 'South', 'East', 'West' (representing the crossing corridor)
        this.crosswalk = crosswalk;
        this.progress = 0;
        this.speed = 0.8 + Math.random() * 0.4;
        this.id = Math.random().toString(36).substr(2, 9);
        this.radius = 4;
        this.color = '#38bdf8'; // sky blue
        
        // Define path coordinates across the road
        if (crosswalk === 'North') { // crossing E-W road on the North crosswalk
            this.y = 350 - 90;
            this.direction = Math.random() < 0.5 ? 1 : -1;
            this.startX = this.direction === 1 ? 350 - 80 : 350 + 80;
            this.endX = this.direction === 1 ? 350 + 80 : 350 - 80;
            this.x = this.startX;
        } else if (crosswalk === 'South') {
            this.y = 350 + 90;
            this.direction = Math.random() < 0.5 ? 1 : -1;
            this.startX = this.direction === 1 ? 350 - 80 : 350 + 80;
            this.endX = this.direction === 1 ? 350 + 80 : 350 - 80;
            this.x = this.startX;
        } else if (crosswalk === 'East') { // crossing N-S road on the East crosswalk
            this.x = 350 + 90;
            this.direction = Math.random() < 0.5 ? 1 : -1;
            this.startY = this.direction === 1 ? 350 - 80 : 350 + 80;
            this.endY = this.direction === 1 ? 350 + 80 : 350 - 80;
            this.y = this.startY;
        } else if (crosswalk === 'West') {
            this.x = 350 - 90;
            this.direction = Math.random() < 0.5 ? 1 : -1;
            this.startY = this.direction === 1 ? 350 - 80 : 350 + 80;
            this.endY = this.direction === 1 ? 350 + 80 : 350 - 80;
            this.y = this.startY;
        }
        
        this.hasFinished = false;
    }

    update(dt) {
        this.progress += (this.speed * dt * 0.005);
        if (this.progress >= 1.0) {
            this.progress = 1.0;
            this.hasFinished = true;
        }

        if (this.crosswalk === 'North' || this.crosswalk === 'South') {
            this.x = this.startX + (this.endX - this.startX) * this.progress;
        } else {
            this.y = this.startY + (this.endY - this.startY) * this.progress;
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.fillStyle = this.color;
        // Pulse glow for pedestrian visibility
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 6;
        
        // Draw head
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Simple walking animation legs (sinusoidal)
        const walkCycle = Math.sin(Date.now() * 0.01 * this.speed);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y + 1);
        ctx.lineTo(this.x - 2 + walkCycle * 2, this.y + 5);
        ctx.moveTo(this.x, this.y + 1);
        ctx.lineTo(this.x + 2 - walkCycle * 2, this.y + 5);
        ctx.stroke();
        
        ctx.restore();
    }
}

// Vehicle Class Definition
class Vehicle {
    constructor(origin, isEmergency = false) {
        this.origin = origin;
        this.isEmergency = isEmergency;
        this.id = Math.random().toString(36).substr(2, 9);
        
        const dirInfo = Directions[origin.toUpperCase()];
        this.dx = dirInfo.dx;
        this.dy = dirInfo.dy;
        
        this.laneIndex = Math.floor(Math.random() * 2);
        const laneOffset = dirInfo.lanes[this.laneIndex];
        
        if (origin === 'North') { this.x = laneOffset; this.y = -40; }
        else if (origin === 'South') { this.x = laneOffset; this.y = 740; }
        else if (origin === 'East') { this.x = 740; this.y = laneOffset; }
        else if (origin === 'West') { this.x = -40; this.y = laneOffset; }

        this.width = isEmergency ? 16 : 14;
        this.length = isEmergency ? 32 : 26;
        this.color = isEmergency ? '#ff3838' : this.getRandomCarColor();
        this.speed = 1.5 + Math.random() * 1.0;
        this.targetSpeed = this.speed;
        this.maxSpeed = isEmergency ? 3.8 : 2.5;
        this.accel = 0.08;
        this.decel = 0.15;
        
        this.waitingTime = 0;
        this.crossedStopLine = false;
        this.hasLeftJunction = false;
        
        this.turnDecision = isEmergency ? 1 : Math.random() < 0.2 ? 0 : Math.random() < 0.25 ? 2 : 1;
        this.turnProgress = 0;
        this.turnPath = null;
        
        // Windshield wiper sweep angle (for rainy weather)
        this.wiperAngle = 0;
        this.wiperDir = 1;
    }

    getRandomCarColor() {
        const colors = ['#00f0ff', '#a855f7', '#3b82f6', '#cbd5e1', '#10b981', '#f59e0b'];
        return colors[Math.floor(Math.random() * colors.length)];
    }
}

// Particle Class for Exhaust Smoke
class Particle {
    constructor(x, y, dx, dy) {
        this.x = x;
        this.y = y;
        this.vx = -dx * 0.4 + (Math.random() - 0.5) * 0.3;
        this.vy = -dy * 0.4 + (Math.random() - 0.5) * 0.3;
        this.alpha = 0.6;
        this.size = 2 + Math.random() * 4;
        this.decay = 0.01 + Math.random() * 0.015;
    }

    update() {
        this.x += this.vx * simSpeed;
        this.y += this.vy * simSpeed;
        this.alpha -= this.decay * simSpeed;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.alpha);
        ctx.fillStyle = 'rgba(120, 120, 130, 0.3)';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// Rainy Weather raindrops
class Raindrop {
    constructor() {
        this.x = Math.random() * 700;
        this.y = Math.random() * -100;
        this.length = 10 + Math.random() * 15;
        this.speed = 12 + Math.random() * 8;
        this.angle = 0.15; // wind blow angle
    }

    update(dt) {
        this.y += this.speed * dt * 0.06 * simSpeed;
        this.x += this.angle * this.speed * dt * 0.06 * simSpeed;
        if (this.y > 700) {
            this.y = -20;
            this.x = Math.random() * 700;
        }
    }

    draw(ctx) {
        ctx.strokeStyle = 'rgba(156, 163, 175, 0.25)';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x + this.angle * this.length, this.y + this.length);
        ctx.stroke();
    }
}

// Spawner logic
let spawnTimers = { North: 0, South: 0, East: 0, West: 0 };

function calculateSpawnInterval() {
    return (60000 / (globalSpawnRate / 4));
}

function handleSpawning(deltaTime) {
    const interval = calculateSpawnInterval();
    const dirs = ['North', 'South', 'East', 'West'];
    
    dirs.forEach(dir => {
        spawnTimers[dir] += deltaTime * simSpeed;
        if (spawnTimers[dir] >= interval) {
            spawnTimers[dir] = 0;
            if (Math.random() < 0.85) {
                spawnVehicle(dir, false);
            }
        }
    });
    
    // Auto-update rain droplet array if rainy mode is active
    if (environmentWeather === 'rainy') {
        if (rainDrops.length < 150) {
            rainDrops.push(new Raindrop());
        }
    } else {
        rainDrops = [];
    }
}

function spawnVehicle(origin, isEmergency = false) {
    const v = new Vehicle(origin, isEmergency);
    vehicles.push(v);
    stats.totalVehiclesSpawned++;
}

// Set active weather/operations mode
function setEnvironment(weather) {
    environmentWeather = weather;
    
    // Adjust colors based on environment lighting
    if (weather === 'night') {
        Colors.grass = '#030406';
        Colors.asphalt = '#0e0f14';
    } else if (weather === 'rainy') {
        Colors.grass = '#0a0c12';
        Colors.asphalt = '#14161f';
    } else {
        Colors.grass = '#090a0f';
        Colors.asphalt = '#1a1b24';
    }

    // Toggle active buttons on side panel
    document.querySelectorAll('.env-btn').forEach(btn => btn.classList.remove('active'));
    const btn = document.getElementById(`env-${weather}`);
    if (btn) btn.classList.add('active');
}

// Trigger pedestrian spawn crossing request
function triggerPedestrianCross() {
    // Pick 1-2 crosswalks randomly and spawn pedestrians
    const crosswalks = ['North', 'South', 'East', 'West'];
    const chosen = crosswalks[Math.floor(Math.random() * crosswalks.length)];
    
    // Spawn 2-3 pedestrians in a cluster
    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
        setTimeout(() => {
            if (isPaused) return;
            pedestrians.push(new Pedestrian(chosen));
            
            // Audio feedback chime if audio enabled
            if (window.playInterfaceBeep) {
                window.playInterfaceBeep(650, 'sine', 0.05);
            }
        }, i * 350);
    }
}

// Check if any pedestrians are crossing a specific zone
function getPedestrianOnCrosswalk(dir) {
    // Returns true if there's a pedestrian in the path of the given inbound road direction
    let isOccupied = false;
    pedestrians.forEach(p => {
        if (dir === 'North' && p.crosswalk === 'North') isOccupied = true;
        if (dir === 'South' && p.crosswalk === 'South') isOccupied = true;
        if (dir === 'East' && p.crosswalk === 'East') isOccupied = true;
        if (dir === 'West' && p.crosswalk === 'West') isOccupied = true;
    });
    return isOccupied;
}

// Physics updates
function updateVehicles(deltaTime) {
    const dt = (deltaTime / 16.66) * simSpeed;
    
    // Handle weather rain updates
    if (environmentWeather === 'rainy') {
        rainDrops.forEach(drop => drop.update(deltaTime));
    }

    // Update pedestrians
    pedestrians.forEach(p => p.update(deltaTime));
    pedestrians = pedestrians.filter(p => !p.hasFinished);

    // Dynamic friction multiplier based on weather (lower friction = longer braking distance in rain)
    const friction = environmentWeather === 'rainy' ? 0.65 : 1.0;

    // Group inbound vehicles
    const directionGroups = { North: [], South: [], East: [], West: [] };
    vehicles.forEach(v => {
        if (!v.crossedStopLine) {
            directionGroups[v.origin].push(v);
        }
    });

    directionGroups.North.sort((a, b) => b.y - a.y);
    directionGroups.South.sort((a, b) => a.y - b.y);
    directionGroups.East.sort((a, b) => a.x - b.x);
    directionGroups.West.sort((a, b) => b.x - a.x);

    for (let i = 0; i < vehicles.length; i++) {
        const v = vehicles[i];
        
        if (!v.crossedStopLine) {
            let passed = false;
            if (v.origin === 'North' && v.y >= Directions.NORTH.stopY) passed = true;
            if (v.origin === 'South' && v.y <= Directions.SOUTH.stopY) passed = true;
            if (v.origin === 'East' && v.x <= Directions.EAST.stopX) passed = true;
            if (v.origin === 'West' && v.x >= Directions.WEST.stopX) passed = true;
            
            if (passed) v.crossedStopLine = true;
        }

        let vehicleAhead = null;
        const originGroup = directionGroups[v.origin];
        if (!v.crossedStopLine && originGroup) {
            const idx = originGroup.indexOf(v);
            if (idx > 0) vehicleAhead = originGroup[idx - 1];
        }

        let isLightRed = false;
        let isLightYellow = false;

        if (!v.crossedStopLine) {
            // Ambulance preemption: states 10-13 mean ONLY one specific direction is green
            if (trafficLightState >= 10) {
                const greenDirMap = { 10: 'North', 11: 'South', 12: 'East', 13: 'West' };
                const greenDir = greenDirMap[trafficLightState];
                // All directions except the ambulance direction are RED
                if (v.origin !== greenDir) {
                    isLightRed = true;
                }
            } else {
                // Normal 4-state cycle
                const lightIndex = Directions[v.origin.toUpperCase()].lightIndex;
                if (lightIndex === 0) {
                    if (trafficLightState === 2 || trafficLightState === 3) isLightRed = true;
                    if (trafficLightState === 1) isLightYellow = true;
                } else {
                    if (trafficLightState === 0 || trafficLightState === 1) isLightRed = true;
                    if (trafficLightState === 3) isLightYellow = true;
                }
            }
        }

        // Check if pedestrians are crossing on the zebra crossings ahead of this stop line
        let isPedestrianBlocking = false;
        if (!v.crossedStopLine) {
            isPedestrianBlocking = getPedestrianOnCrosswalk(v.origin);
        }

        let targetAcc = v.accel;
        let finalTargetSpeed = v.maxSpeed;

        // Apply braking logic if light is red/yellow OR pedestrians are blocking
        if (!v.crossedStopLine && (isLightRed || isLightYellow || isPedestrianBlocking)) {
            let distToStop = 999;
            if (v.origin === 'North') distToStop = Directions.NORTH.stopY - v.y;
            if (v.origin === 'South') distToStop = v.y - Directions.SOUTH.stopY;
            if (v.origin === 'East') distToStop = v.x - Directions.EAST.stopX;
            if (v.origin === 'West') distToStop = Directions.WEST.stopX - v.x;

            const safetyDistance = isPedestrianBlocking ? 180 : 160;

            if (distToStop > 0 && distToStop < safetyDistance) {
                const ratio = distToStop / safetyDistance;
                finalTargetSpeed = v.maxSpeed * (ratio * ratio);
                if (distToStop < 20) {
                    finalTargetSpeed = 0;
                }
                targetAcc = -v.decel * friction;
            }
        }

        // Avoid tailgating vehicle ahead
        if (vehicleAhead) {
            let distToCar = 999;
            if (v.origin === 'North') distToCar = vehicleAhead.y - v.y - vehicleAhead.length;
            if (v.origin === 'South') distToCar = v.y - vehicleAhead.y - vehicleAhead.length;
            if (v.origin === 'East') distToCar = v.x - vehicleAhead.x - vehicleAhead.length;
            if (v.origin === 'West') distToCar = vehicleAhead.x - v.x - vehicleAhead.length;

            if (distToCar < 60) {
                if (distToCar < 15) {
                    finalTargetSpeed = 0;
                } else {
                    finalTargetSpeed = Math.min(finalTargetSpeed, vehicleAhead.speed * 0.85);
                }
                targetAcc = -v.decel * 1.6 * friction;
            }
        }

        // Apply velocity change
        if (v.speed < finalTargetSpeed) {
            v.speed += v.accel * dt;
            if (v.speed > finalTargetSpeed) v.speed = finalTargetSpeed;
        } else if (v.speed > finalTargetSpeed) {
            v.speed += targetAcc * dt;
            if (v.speed < finalTargetSpeed) v.speed = finalTargetSpeed;
        }
        if (v.speed < 0) v.speed = 0;

        // Movement displacement
        if (!v.crossedStopLine || v.turnDecision === 1) {
            v.x += v.dx * v.speed * dt;
            v.y += v.dy * v.speed * dt;
        } else {
            v.turnProgress += (v.speed * dt) * 0.008;
            if (v.turnProgress >= 1.0) {
                v.turnProgress = 1.0;
                const initialTurn = v.turnDecision;
                v.crossedStopLine = true;
                v.turnDecision = 1;
                
                if (v.origin === 'North') {
                    v.dy = 0;
                    v.dx = (initialTurn === 0) ? 1 : -1;
                } else if (v.origin === 'South') {
                    v.dy = 0;
                    v.dx = (initialTurn === 0) ? -1 : 1;
                } else if (v.origin === 'East') {
                    v.dx = 0;
                    v.dy = (initialTurn === 0) ? 1 : -1;
                } else if (v.origin === 'West') {
                    v.dx = 0;
                    v.dy = (initialTurn === 0) ? -1 : 1;
                }
            } else {
                const startPoint = { x: v.x, y: v.y };
                if (!v.turnPath) {
                    v.turnPath = getTurnPathCoordinates(v);
                }
                const pt = getQuadraticBezierPoint(v.turnPath.start, v.turnPath.control, v.turnPath.end, v.turnProgress);
                v.x = pt.x;
                v.y = pt.y;
            }
        }

        // Wiper cycles
        if (environmentWeather === 'rainy') {
            v.wiperAngle += 0.1 * v.wiperDir;
            if (Math.abs(v.wiperAngle) > 0.8) {
                v.wiperDir *= -1;
            }
        }

        // Emissions delay accumulation
        if (v.speed < 0.15) {
            v.waitingTime += dt;
            stats.totalDelay += dt / 60;
            stats.idleFrames += dt;
            
            if (Math.random() < 0.08) {
                let px = v.x - v.dx * (v.length / 2);
                let py = v.y - v.dy * (v.length / 2);
                particles.push(new Particle(px, py, v.dx, v.dy));
            }
        }

        if (v.x < -100 || v.x > 800 || v.y < -100 || v.y > 800) {
            v.hasLeftJunction = true;
        }
    }

    const previousCount = vehicles.length;
    vehicles = vehicles.filter(v => !v.hasLeftJunction);
    const cleared = previousCount - vehicles.length;
    stats.totalVehiclesCleared += cleared;

    // Siren alarm sound trigger check
    let sirenOn = vehicles.some(v => v.isEmergency && !v.crossedStopLine);
    if (window.toggleSirenSynth) {
        window.toggleSirenSynth(sirenOn);
    }

    particles.forEach(p => p.update());
    particles = particles.filter(p => p.alpha > 0);
}

function initSimulation(canvasId) {
    canvas = document.getElementById(canvasId);
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    resetSimulation();
}

function resetSimulation() {
    vehicles = [];
    particles = [];
    pedestrians = [];
    rainDrops = [];
    trafficLightTimer = 0;
    trafficLightState = 0;
    
    stats.totalVehiclesSpawned = 0;
    stats.totalVehiclesCleared = 0;
    stats.totalDelay = 0;
    stats.currentDelaySum = 0;
    stats.idleFrames = 0;
    stats.fuelWasted = 0;
    stats.co2Emitted = 0;
    stats.co2Saved = 0;
    
    Object.keys(spawnTimers).forEach(k => spawnTimers[k] = 0);
}

function setSpeed(speed) { simSpeed = speed; }
function setDensity(density) { globalSpawnRate = density; }

function updateSensors() {
    Object.keys(sensors).forEach(dir => {
        sensors[dir].active = false;
    });

    vehicles.forEach(v => {
        if (v.crossedStopLine) return;
        Object.keys(sensors).forEach(dir => {
            const s = sensors[dir];
            if (v.x >= s.x && v.x <= s.x + s.w && v.y >= s.y && v.y <= s.y + s.h) {
                sensors[dir].active = true;
            }
        });
    });

    const dirs = ['N', 'S', 'E', 'W'];
    const names = ['North', 'South', 'East', 'West'];
    dirs.forEach((d, idx) => {
        const el = document.getElementById(`sensor-${d}`);
        if (el) {
            if (sensors[names[idx]].active) {
                el.innerText = 'ON';
                el.className = 'sensor-status badge-green';
            } else {
                el.innerText = 'OFF';
                el.className = 'sensor-status badge-red';
            }
        }
    });
}

function getQueueLengths() {
    const queues = { North: 0, South: 0, East: 0, West: 0 };
    vehicles.forEach(v => {
        if (!v.crossedStopLine) {
            if (v.speed < 0.5) {
                queues[v.origin]++;
            }
        }
    });
    return queues;
}

function getEmergencyQueue() {
    const emergencies = { North: 0, South: 0, East: 0, West: 0 };
    vehicles.forEach(v => {
        if (v.isEmergency && !v.crossedStopLine) {
            emergencies[v.origin]++;
        }
    });
    return emergencies;
}

function setTrafficLightState(stateIndex) {
    trafficLightState = stateIndex;
    // Clear ambulance priority dir if returning to normal cycle
    if (stateIndex < 10) {
        ambulancePriorityDir = null;
    }
}

function setAmbulancePriority(dir) {
    ambulancePriorityDir = dir;
    const stateMap = { 'North': 10, 'South': 11, 'East': 12, 'West': 13 };
    trafficLightState = stateMap[dir];
}

function getTrafficLightState() {
    return trafficLightState;
}

function getQuadraticBezierPoint(p0, p1, p2, t) {
    return {
        x: (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x,
        y: (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y
    };
}

function getTurnPathCoordinates(v) {
    const origin = v.origin;
    const isLeft = v.turnDecision === 0;
    
    let start = { x: v.x, y: v.y };
    let control = { x: 350, y: 350 };
    let end = { x: 350, y: 350 };
    
    const outerLane = 350 + 60;
    const innerLane = 350 + 20;
    const outerLaneInv = 350 - 60;
    const innerLaneInv = 350 - 20;

    if (origin === 'North') {
        end.y = 350;
        if (isLeft) {
            end.x = 350 + stopLineOffset;
            end.y = outerLaneInv;
            control = { x: start.x, y: outerLaneInv };
        } else {
            end.x = 350 - stopLineOffset;
            end.y = innerLane;
            control = { x: start.x, y: innerLane };
        }
    } else if (origin === 'South') {
        end.y = 350;
        if (isLeft) {
            end.x = 350 - stopLineOffset;
            end.y = innerLane;
            control = { x: start.x, y: innerLane };
        } else {
            end.x = 350 + stopLineOffset;
            end.y = outerLaneInv;
            control = { x: start.x, y: outerLaneInv };
        }
    } else if (origin === 'East') {
        end.x = 350;
        if (isLeft) {
            end.y = 350 + stopLineOffset;
            end.x = outerLane;
            control = { x: outerLane, y: start.y };
        } else {
            end.y = 350 - stopLineOffset;
            end.x = outerLaneInv;
            control = { x: outerLaneInv, y: start.y };
        }
    } else if (origin === 'West') {
        end.x = 350;
        if (isLeft) {
            end.y = 350 - stopLineOffset;
            end.x = outerLaneInv;
            control = { x: outerLaneInv, y: start.y };
        } else {
            end.y = 350 + stopLineOffset;
            end.x = outerLane;
            control = { x: outerLane, y: start.y };
        }
    }
    return { start, control, end };
}

// Drawing Orchestrator
function drawSimulation() {
    if (!ctx) return;
    
    ctx.fillStyle = Colors.grass;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Asphalt Roads
    ctx.fillStyle = Colors.asphalt;
    ctx.fillRect(350 - halfRoad, 0, roadWidth, canvas.height);
    ctx.fillRect(0, 350 - halfRoad, canvas.width, roadWidth);

    drawRoadMarkings();
    drawSensors();
    drawTrafficLights();
    
    // Draw particles
    particles.forEach(p => p.draw(ctx));

    // Draw pedestrians
    pedestrians.forEach(p => p.draw(ctx));

    // Draw vehicles with headlights (night/rainy mode)
    vehicles.forEach(v => drawVehicle(v));

    // Overlay rain falling on top
    if (environmentWeather === 'rainy') {
        rainDrops.forEach(drop => drop.draw(ctx));
        
        // Wet rain splash reflections
        ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
        ctx.fillRect(0, 0, 700, 700);
    }
    
    // Ambient night lighting glow overlay
    if (environmentWeather === 'night') {
        // Draw standard ambient darkness mask
        ctx.save();
        ctx.fillStyle = 'rgba(3, 4, 6, 0.55)';
        ctx.fillRect(0, 0, 700, 700);
        ctx.restore();
    }

    // Ambulance emergency alert overlay (drawn last so it's always on top)
    drawAmbulanceAlertOverlay();
}

function drawRoadMarkings() {
    ctx.save();
    ctx.strokeStyle = Colors.yellowLine;
    ctx.lineWidth = 3;
    
    ctx.beginPath();
    ctx.setLineDash([15, 10]);
    ctx.moveTo(350, 0);
    ctx.lineTo(350, 350 - halfRoad);
    ctx.moveTo(350, 350 + halfRoad);
    ctx.lineTo(350, canvas.height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, 350);
    ctx.lineTo(350 - halfRoad, 350);
    ctx.moveTo(350 + halfRoad, 350);
    ctx.lineTo(canvas.width, 350);
    ctx.stroke();

    ctx.strokeStyle = Colors.marking;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    
    ctx.moveTo(350 - 40, 0);
    ctx.lineTo(350 - 40, 350 - halfRoad);
    ctx.moveTo(350 + 40, 0);
    ctx.lineTo(350 + 40, 350 - halfRoad);

    ctx.moveTo(350 - 40, 350 + halfRoad);
    ctx.lineTo(350 - 40, canvas.height);
    ctx.moveTo(350 + 40, 350 + halfRoad);
    ctx.lineTo(350 + 40, canvas.height);

    ctx.moveTo(0, 350 - 40);
    ctx.lineTo(350 - halfRoad, 350 - 40);
    ctx.moveTo(0, 350 + 40);
    ctx.lineTo(350 - halfRoad, 350 + 40);

    ctx.moveTo(350 + halfRoad, 350 - 40);
    ctx.lineTo(canvas.width, 350 - 40);
    ctx.moveTo(350 + halfRoad, 350 + 40);
    ctx.lineTo(canvas.width, 350 + 40);
    ctx.stroke();

    // Solid white stop lines
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(350 - 80, 350 - stopLineOffset);
    ctx.lineTo(350, 350 - stopLineOffset);
    
    ctx.moveTo(350, 350 + stopLineOffset);
    ctx.lineTo(350 + 80, 350 + stopLineOffset);

    ctx.moveTo(350 + stopLineOffset, 350 - 80);
    ctx.lineTo(350 + stopLineOffset, 350);

    ctx.moveTo(350 - stopLineOffset, 350);
    ctx.lineTo(350 - stopLineOffset, 350 + 80);
    ctx.stroke();

    // Crosswalks (zebra crossings)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 6;
    ctx.setLineDash([6, 8]);
    
    ctx.beginPath();
    ctx.moveTo(350 - 80, 350 - 90);
    ctx.lineTo(350 + 80, 350 - 90);
    ctx.moveTo(350 - 80, 350 + 90);
    ctx.lineTo(350 + 80, 350 + 90);
    ctx.moveTo(350 + 90, 350 - 80);
    ctx.lineTo(350 + 90, 350 + 80);
    ctx.moveTo(350 - 90, 350 - 80);
    ctx.lineTo(350 - 90, 350 + 80);
    ctx.stroke();
    ctx.restore();
}

function drawSensors() {
    ctx.save();
    Object.keys(sensors).forEach(dir => {
        const s = sensors[dir];
        ctx.strokeStyle = s.active ? '#00f0ff' : 'rgba(255,255,255,0.05)';
        ctx.fillStyle = s.active ? Colors.sensorActive : 'transparent';
        ctx.lineWidth = 1.5;
        ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.strokeRect(s.x, s.y, s.w, s.h);
        
        ctx.fillStyle = s.active ? '#00f0ff' : 'rgba(255,255,255,0.15)';
        ctx.font = '700 8px Outfit';
        ctx.fillText(`${dir[0]} SENSOR`, s.x + 6, s.y + 12);
    });
    ctx.restore();
}

function getDirectionLightColor(dir) {
    // Returns the color for a specific direction's traffic light
    const stateMap = { 10: 'North', 11: 'South', 12: 'East', 13: 'West' };
    
    if (trafficLightState >= 10) {
        // Ambulance preemption mode: only the ambulance direction is green
        const greenDir = stateMap[trafficLightState];
        if (dir === greenDir) return Colors.lightGreen;
        return Colors.lightRed;
    }

    // Normal cycle
    const isNS = (dir === 'North' || dir === 'South');
    if (isNS) {
        if (trafficLightState === 0) return Colors.lightGreen;
        if (trafficLightState === 1) return Colors.lightYellow;
        return Colors.lightRed;
    } else {
        if (trafficLightState === 2) return Colors.lightGreen;
        if (trafficLightState === 3) return Colors.lightYellow;
        return Colors.lightRed;
    }
}

function drawTrafficLights() {
    const posts = {
        North: { x: 350 - 100, y: 350 - 115 },
        South: { x: 350 + 85, y: 350 + 100 },
        East: { x: 350 + 100, y: 350 - 100 },
        West: { x: 350 - 115, y: 350 + 85 }
    };

    ctx.save();
    
    Object.keys(posts).forEach(dir => {
        const p = posts[dir];
        const activeColor = getDirectionLightColor(dir);
        
        // Draw light box
        ctx.fillStyle = '#1c1e29';
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.fillRect(p.x, p.y, 16, 16);
        ctx.strokeRect(p.x, p.y, 16, 16);
        
        // Active bulb
        ctx.shadowBlur = 0;
        ctx.fillStyle = activeColor;
        ctx.beginPath();
        ctx.arc(p.x + 8, p.y + 8, 4.5, 0, Math.PI * 2);
        ctx.fill();
        
        // Light halos
        if (activeColor !== Colors.lightRed) {
            ctx.shadowColor = activeColor;
            ctx.shadowBlur = 12;
            ctx.fillStyle = activeColor;
            ctx.beginPath();
            ctx.arc(p.x + 8, p.y + 8, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    });
    ctx.restore();
}

function drawAmbulanceAlertOverlay() {
    if (trafficLightState < 10 || !ambulancePriorityDir) return;
    
    const flash = Math.floor(Date.now() / 350) % 2 === 0;
    if (!flash) return;

    ctx.save();

    // Red border pulse
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
    ctx.lineWidth = 5;
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 20;
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
    ctx.shadowBlur = 0;

    // Alert banner at top
    const gradient = ctx.createLinearGradient(0, 0, 0, 44);
    gradient.addColorStop(0, 'rgba(220, 38, 38, 0.88)');
    gradient.addColorStop(1, 'rgba(220, 38, 38, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, 44);

    // Alert text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 4;
    ctx.fillText(`🚨 AMBULANCE PRIORITY — ${ambulancePriorityDir.toUpperCase()} CORRIDOR CLEARED`, canvas.width / 2, 21);
    ctx.fillText('ALL OTHER DIRECTIONS HELD RED', canvas.width / 2, 37);

    ctx.restore();
}

function drawVehicle(v) {
    ctx.save();
    ctx.translate(v.x, v.y);
    
    let angle = 0;
    if (v.dx === 0) {
        angle = v.dy > 0 ? Math.PI : 0;
    } else {
        angle = v.dx > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    ctx.rotate(angle);

    const w = v.width;
    const l = v.length;
    
    // Draw headlights cone (in Night/Rainy mode)
    if (environmentWeather === 'night' || environmentWeather === 'rainy') {
        ctx.save();
        // Headlights are located at local -l/2, shooting downwards in local negative y axis (which is up on local canvas)
        // Set composite operation for additive glowing effect
        ctx.globalCompositeOperation = 'screen';
        
        const grad = ctx.createRadialGradient(0, -l/2, 2, 0, -l/2 - 110, 60);
        grad.addColorStop(0, 'rgba(255, 253, 220, 0.45)');
        grad.addColorStop(0.3, 'rgba(255, 253, 220, 0.18)');
        grad.addColorStop(1, 'rgba(255, 253, 220, 0)');
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(0, -l/2);
        ctx.lineTo(-45, -l/2 - 110);
        ctx.lineTo(45, -l/2 - 110);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    // Vehicle Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(-w/2 + 2, -l/2 + 2, w, l);

    // Main Body
    ctx.fillStyle = v.color;
    ctx.fillRect(-w/2, -l/2, w, l);
    
    // Windshield glass
    ctx.fillStyle = 'rgba(10, 12, 20, 0.8)';
    ctx.fillRect(-w/2 + 2, -l/2 + 5, w - 4, 4);
    
    // Rear windshield
    ctx.fillRect(-w/2 + 2, l/2 - 8, w - 4, 3);
    
    // Windshield wipers (if raining)
    if (environmentWeather === 'rainy') {
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        ctx.save();
        // Wiper 1
        ctx.translate(-3, -l/2 + 9);
        ctx.rotate(v.wiperAngle);
        ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0, -3.5); ctx.stroke();
        ctx.restore();
        ctx.save();
        // Wiper 2
        ctx.translate(3, -l/2 + 9);
        ctx.rotate(v.wiperAngle);
        ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0, -3.5); ctx.stroke();
        ctx.restore();
    }

    // Headlight bulbs
    ctx.fillStyle = '#fffae0';
    ctx.fillRect(-w/2 + 1, -l/2, 2, 1);
    ctx.fillRect(w/2 - 3, -l/2, 2, 1);
    
    // Tail lights
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-w/2 + 1, l/2 - 1, 2, 1);
    ctx.fillRect(w/2 - 3, l/2 - 1, 2, 1);
    
    // Emergency ambulance flasher beacon
    if (v.isEmergency) {
        const flashTimer = Date.now() / 120;
        ctx.fillStyle = (Math.floor(flashTimer) % 2 === 0) ? '#3b82f6' : '#ef4444';
        ctx.fillRect(-w/4, -1, w/2, 3);
        
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 15;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-2, 0, 4, 1.5);
    }
    
    ctx.restore();
}
