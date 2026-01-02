const PacmanEngine = {
    // --- STATE ---
    ctx: null,
    canvas: null,
    score: 0,
    lives: 3,
    state: 'READY',
    gameActive: false,
    
    // --- CONFIG ---
    cellSize: 20,
    offset: { x: 0, y: 0 },
    powerTimer: 0,
    
    // --- ENTITIES ---
    player: { gx: 9, gy: 14, dir: 4, nextDir: 4, moveProgress: 0, frame: 0 },
    ghosts: [],
    map: [],

    // 1=Wall, 0=Dot, 2=Power, 9=Empty
    baseMap: [
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
        [1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1],
        [1,2,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,2,1],
        [1,0,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,1,1,0,1,0,1,1,1,1,1,0,1,0,1,1,0,1],
        [1,0,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,1],
        [1,1,1,1,0,1,1,1,9,1,9,1,1,1,0,1,1,1,1],
        [9,9,9,1,0,1,9,9,9,9,9,9,9,1,0,1,9,9,9],
        [1,1,1,1,0,1,9,1,1,9,1,1,9,1,0,1,1,1,1], // Ghost House
        [1,0,0,0,0,0,0,1,9,9,9,1,0,0,0,0,0,0,1],
        [1,0,1,1,0,1,0,1,1,1,1,1,0,1,0,1,1,0,1],
        [1,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,1],
        [1,1,0,1,0,1,1,1,0,1,0,1,1,1,0,1,0,1,1],
        [1,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,1], // Start Row
        [1,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,1],
        [1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1],
        [1,0,1,1,1,1,1,1,0,1,0,1,1,1,1,1,1,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
    ],

    init: function(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.resetGame();
    },

    // Called on new game
    resetGame: function() {
        this.score = 0;
        this.lives = 3;
        this.map = JSON.parse(JSON.stringify(this.baseMap));
        this.resetLevelConfig();
        this.resetPositions(); // Initial Placement
    },

    // Called to calculate grid size
    resetLevelConfig: function() {
        this.cellSize = Math.floor(this.canvas.height / this.baseMap.length);
        const mapW = this.cellSize * this.baseMap[0].length;
        this.offset.x = (this.canvas.width - mapW) / 2;
        this.offset.y = 0;
    },

    // ** NEW: Soft Reset (Called on Death) **
    resetPositions: function() {
        // 1. Reset Player to Start
        this.player = { 
            gx: 9, gy: 14, 
            dir: 4, nextDir: 4, // 4 = Stopped
            moveProgress: 0, 
            frame: 0 
        };

        // 2. Reset Ghosts to House
        this.ghosts = [
            { gx: 9, gy: 7, colorIdx: 0, dir: 0, moveProgress: 0, speed: 0.06, type: 0 }, // Red
            { gx: 8, gy: 9, colorIdx: 1, dir: 2, moveProgress: 0, speed: 0.05, type: 1 }, // Pink
            { gx: 10, gy: 9, colorIdx: 2, dir: 0, moveProgress: 0, speed: 0.05, type: 2 }, // Cyan
            { gx: 9, gy: 9, colorIdx: 3, dir: 3, moveProgress: 0, speed: 0.04, type: 3 }  // Orange
        ];
        
        this.powerTimer = 0;
        this.gameActive = false; // Clear power mode
    },

    update: function(input, onGameOver, onUpdateHUD) {

        
        // 1. Player Input
        if(input.right) this.player.nextDir = 0;
        if(input.down) this.player.nextDir = 1;
        if(input.left) this.player.nextDir = 2;
        if(input.up) this.player.nextDir = 3;

        this.moveCharacter(this.player, 0.15, false);

        // 2. Ghost Logic
        if(this.powerTimer > 0) this.powerTimer--;

        this.ghosts.forEach(g => {
            let speed = (this.powerTimer > 0) ? g.speed * 0.5 : g.speed;
            this.moveCharacter(g, speed, true);

            // Collision Check
            let pGx = Math.round(this.player.gx + (this.player.dir===0?0.5:this.player.dir===2?-0.5:0) * this.player.moveProgress);
            let pGy = Math.round(this.player.gy + (this.player.dir===1?0.5:this.player.dir===3?-0.5:0) * this.player.moveProgress);
            
            let gGx = Math.round(g.gx + (g.dir===0?0.5:g.dir===2?-0.5:0) * g.moveProgress);
            let gGy = Math.round(g.gy + (g.dir===1?0.5:g.dir===3?-0.5:0) * g.moveProgress);

            if(pGx === gGx && pGy === gGy) {
                if(this.powerTimer > 0) {
                    // Eat Ghost
                    this.score += 200;
                    g.gx = 9; g.gy = 9; // Send Home
                    g.moveProgress = 0;
                } else {
                    // --- DEATH EVENT ---
                    this.lives--;
                    onUpdateHUD(this.score, this.lives);
                    
                    if(this.lives <= 0) {
                        onGameOver(this.score);
                    } else {
                        // Soft Reset: Stick everyone back to start
                        this.resetPositions();
                    }
                }
            }
        });

        onUpdateHUD(this.score, this.lives);
        this.player.frame++;
    },

    moveCharacter: function(char, speed, isGhost) {
        if (char.dir === 4) { // Stopped
            if (char.nextDir !== 4 && this.canMove(char.gx, char.gy, char.nextDir)) {
                char.dir = char.nextDir;
            } else {
                return; // Don't move if stopped and blocked
            }
        }

        char.moveProgress += speed;

        if (char.moveProgress >= 1) {
            // Commit move
            if (char.dir === 0) char.gx++;
            if (char.dir === 1) char.gy++;
            if (char.dir === 2) char.gx--;
            if (char.dir === 3) char.gy--;
            
            char.moveProgress = 0;

            if (!isGhost) {
                // Eating
                let cell = this.map[char.gy][char.gx];
                if (cell === 0) { this.map[char.gy][char.gx] = 9; this.score += 10; }
                if (cell === 2) { this.map[char.gy][char.gx] = 9; this.score += 50; this.powerTimer = 600; }

                // Check Next Turn
                if (this.canMove(char.gx, char.gy, char.nextDir)) {
                    char.dir = char.nextDir;
                } else if (!this.canMove(char.gx, char.gy, char.dir)) {
                    char.dir = 4; // Stop if hitting wall
                }
            } else {
                // AI Decision
                char.dir = this.getGhostDirection(char);
            }
        }
    },

    getGhostDirection: function(g) {
        let validMoves = [];
        if(this.canMove(g.gx, g.gy, 0) && g.dir !== 2) validMoves.push(0);
        if(this.canMove(g.gx, g.gy, 1) && g.dir !== 3) validMoves.push(1);
        if(this.canMove(g.gx, g.gy, 2) && g.dir !== 0) validMoves.push(2);
        if(this.canMove(g.gx, g.gy, 3) && g.dir !== 1) validMoves.push(3);

        if(validMoves.length === 0) return (g.dir + 2) % 4;

        if (this.powerTimer > 0) return validMoves[Math.floor(Math.random() * validMoves.length)];
        
        if (g.type === 0 || g.type === 1) { 
            let targetX = this.player.gx;
            let targetY = this.player.gy;
            if(g.type === 1) { // Ambush logic
                if(this.player.dir === 0) targetX += 4;
                if(this.player.dir === 1) targetY += 4;
                if(this.player.dir === 2) targetX -= 4;
                if(this.player.dir === 3) targetY -= 4;
            }
            let bestDir = validMoves[0];
            let minDist = 999999;
            for(let move of validMoves) {
                let nx = g.gx + (move===0?1:move===2?-1:0);
                let ny = g.gy + (move===1?1:move===3?-1:0);
                let dist = Math.pow(nx - targetX, 2) + Math.pow(ny - targetY, 2);
                if(dist < minDist) { minDist = dist; bestDir = move; }
            }
            return bestDir;
        } 
        return validMoves[Math.floor(Math.random() * validMoves.length)];
    },

    canMove: function(x, y, dir) {
        let nx = x + (dir===0?1 : dir===2?-1 : 0);
        let ny = y + (dir===1?1 : dir===3?-1 : 0);
        if(ny < 0 || ny >= this.map.length || nx < 0 || nx >= this.map[0].length) return false;
        return this.map[ny][nx] !== 1;
    },

    draw: function(theme) {
        this.ctx.fillStyle = theme.bg;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        let cs = this.cellSize;
        let ox = this.offset.x;

        // Draw Map
        this.ctx.lineWidth = 2;
        for(let y=0; y<this.map.length; y++) {
            for(let x=0; x<this.map[y].length; x++) {
                let cell = this.map[y][x];
                let cx = x * cs + ox; let cy = y * cs;

                if(cell === 1) { 
                    this.ctx.strokeStyle = theme.brick; 
                    this.ctx.strokeRect(cx + 4, cy + 4, cs - 8, cs - 8);
                    this.ctx.fillStyle = theme.brick;
                    this.ctx.fillRect(cx + cs/2 - 1, cy + cs/2 - 1, 2, 2);
                } else if(cell === 0) { 
                    this.ctx.fillStyle = theme.text;
                    this.ctx.beginPath(); this.ctx.arc(cx+cs/2, cy+cs/2, 2, 0, Math.PI*2); this.ctx.fill();
                } else if(cell === 2) { 
                    this.ctx.fillStyle = theme.plasma;
                    this.ctx.beginPath(); this.ctx.arc(cx+cs/2, cy+cs/2, 6, 0, Math.PI*2); this.ctx.fill();
                }
            }
        }

        // Draw Ghosts
        this.ghosts.forEach(g => {
            let gx = g.gx; let gy = g.gy;
            if(g.dir === 0) gx += g.moveProgress;
            if(g.dir === 1) gy += g.moveProgress;
            if(g.dir === 2) gx -= g.moveProgress;
            if(g.dir === 3) gy -= g.moveProgress;

            let cx = gx * cs + ox + cs/2; let cy = gy * cs + cs/2;

            this.ctx.fillStyle = (this.powerTimer > 0 && Math.floor(Date.now()/200)%2===0) ? '#0000FF' : theme.pacGhost[g.colorIdx];
            this.ctx.beginPath();
            this.ctx.arc(cx, cy - 2, cs/2 - 2, Math.PI, 0); 
            this.ctx.lineTo(cx + cs/2 - 2, cy + cs/2); 
            this.ctx.lineTo(cx - cs/2 + 2, cy + cs/2); 
            this.ctx.fill();

            // Eyes
            this.ctx.fillStyle = '#FFF';
            let ex = (g.dir===0?2 : g.dir===2?-2 : 0);
            let ey = (g.dir===1?2 : g.dir===3?-2 : 0);
            this.ctx.beginPath(); this.ctx.arc(cx - 4 + ex, cy - 4 + ey, 3, 0, Math.PI*2); this.ctx.fill();
            this.ctx.beginPath(); this.ctx.arc(cx + 4 + ex, cy - 4 + ey, 3, 0, Math.PI*2); this.ctx.fill();
            this.ctx.fillStyle = '#000';
            this.ctx.beginPath(); this.ctx.arc(cx - 4 + ex*1.5, cy - 4 + ey*1.5, 1.5, 0, Math.PI*2); this.ctx.fill(); 
            this.ctx.beginPath(); this.ctx.arc(cx + 4 + ex*1.5, cy - 4 + ey*1.5, 1.5, 0, Math.PI*2); this.ctx.fill(); 
        });

        // Draw Player
        let px = this.player.gx; let py = this.player.gy;
        if(this.player.dir === 0) px += this.player.moveProgress;
        if(this.player.dir === 1) py += this.player.moveProgress;
        if(this.player.dir === 2) px -= this.player.moveProgress;
        if(this.player.dir === 3) py -= this.player.moveProgress;

        let pcx = px * cs + ox + cs/2; let pcy = py * cs + cs/2;

        this.ctx.fillStyle = theme.pacPlayer;
        this.ctx.beginPath();
        let mouth = Math.abs(Math.sin(this.player.frame * 0.2)) * 0.2 + 0.05; 
        let rot = (this.player.dir === 4 ? 0 : this.player.dir) * (Math.PI/2);
        this.ctx.arc(pcx, pcy, cs/2 - 2, rot + mouth, rot + (Math.PI*2) - mouth);
        this.ctx.lineTo(pcx, pcy);
        this.ctx.fill();
    }
};