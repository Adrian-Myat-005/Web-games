const MotoEngine = {
    // --- STATE ---
    ctx: null,
    canvas: null,
    gameActive: false,
    state: 'MENU', // MENU, PLAYING, WON, CRASHED
    score: 0,
    
    // --- CONFIG ---
    gravity: 0.22,
    friction: 0.99,
    enginePower: 0.28,
    rotationSpeed: 0.07,
    zoom: 0.6,
    segmentWidth: 40, // FIXED WIDTH to prevent falling
    trackLength: 300,
    
    // --- ENTITIES ---
    camera: { x: 0, y: 0 },
    bike: { x: 0, y: 0, dx: 0, dy: 0, angle: 0, dAngle: 0, radius: 14, grounded: false },
    track: [], 

    init: function(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.resetGame();
    },

    resetGame: function() {
        this.score = 0;
        this.gameActive = false;
        this.state = 'MENU';
        
        // Spawn bike
        this.bike = { x: 100, y: 300, dx: 0, dy: 0, angle: 0, dAngle: 0, radius: 14, grounded: false };
        this.camera = { x: 0, y: 0 };

        // Generate Track (Fixed Width Method)
        this.track = [];
        let curX = 0;
        let curY = 500;
        
        // 1. Runway
        for(let i=0; i<15; i++) {
            this.track.push({x: curX, y: curY});
            curX += this.segmentWidth;
        }

        // 2. Procedural Hills
        for(let i=0; i<this.trackLength; i++) {
            this.track.push({x: curX, y: curY});
            curX += this.segmentWidth; // ALWAYS 40px
            
            // Smooth Terrain Math
            let slope = Math.sin(i * 0.1) * 20; 
            let hills = Math.sin(i * 0.05) * 50;
            
            curY += slope + hills;
            
            // Keep bounds
            if(curY < 200) curY = 200;
            if(curY > 1200) curY = 1200;
        }

        // 3. Finish Line
        for(let i=0; i<30; i++) {
            this.track.push({x: curX, y: curY});
            curX += this.segmentWidth;
        }
    },

    update: function(input, onGameOver, onUpdateHUD) {
        // --- MENU LOGIC ---
        if (this.state === 'MENU') {
            // Wait for input to start
            if (input.up || input.right || input.space) {
                this.state = 'PLAYING';
                this.gameActive = true;
            }
            return;
        }
        
        if (this.state === 'WON' || this.state === 'CRASHED') return;

        const b = this.bike;

        // --- 1. PHYSICS ---
        b.dy += this.gravity;

        if (b.grounded) {
            if (input.up || input.right) {
                b.dx += Math.cos(b.angle) * this.enginePower;
                b.dy += Math.sin(b.angle) * this.enginePower;
            }
            if (input.down || input.left) b.dx *= 0.95; // Brake
        } else {
            // Air Rotation
            if (input.left) b.dAngle -= this.rotationSpeed;
            if (input.right) b.dAngle += this.rotationSpeed;
        }

        b.x += b.dx;
        b.y += b.dy;
        b.angle += b.dAngle;
        
        b.dx *= this.friction;
        b.dy *= this.friction;
        b.dAngle *= 0.90; 

        // --- 2. ROBUST COLLISION ---
        b.grounded = false;
        
        // Calculate exact segment index based on fixed width
        let index = Math.floor(b.x / this.segmentWidth);
        
        // Check current and next segment
        if (index >= 0 && index < this.track.length - 1) {
            let p1 = this.track[index];
            let p2 = this.track[index+1];

            // Interpolate Height
            let ratio = (b.x - p1.x) / (p2.x - p1.x);
            let groundY = p1.y + ratio * (p2.y - p1.y);
            let slope = Math.atan2(p2.y - p1.y, p2.x - p1.x);

            // Floor Collision
            if (b.y + b.radius >= groundY) {
                b.y = groundY - b.radius;
                b.dy = 0;
                b.grounded = true;

                // Match Rotation
                let angleDiff = slope - b.angle;
                while (angleDiff <= -Math.PI) angleDiff += Math.PI*2;
                while (angleDiff > Math.PI) angleDiff -= Math.PI*2;
                b.dAngle += angleDiff * 0.2; 
                
                // Head Crash (Upside down)
                if (Math.abs(angleDiff) > 2.0) {
                    this.state = 'CRASHED';
                    setTimeout(() => { onGameOver(this.score); this.resetGame(); }, 1500);
                }
            }
        }

        // --- 3. GOAL & DEATH ---
        // Finish Line
        let finishIndex = this.track.length - 20;
        if (b.x > this.track[finishIndex].x) {
            this.state = 'WON';
            this.score += 5000;
            setTimeout(() => { onGameOver(this.score); this.resetGame(); }, 2000);
        }

        // Fall off world (Limit is now huge to prevent accidental death)
        if (b.y > 3000) { 
            this.state = 'CRASHED'; 
            setTimeout(() => { onGameOver(this.score); this.resetGame(); }, 1000);
        }

        // --- 4. CAMERA ---
        let targetCamX = b.x - this.canvas.width * 0.3 / this.zoom;
        let targetCamY = b.y - this.canvas.height * 0.6 / this.zoom;

        this.camera.x += (targetCamX - this.camera.x) * 0.1;
        this.camera.y += (targetCamY - this.camera.y) * 0.1;

        // Score
        let dist = Math.floor(b.x / 100);
        if (dist > this.score) this.score = dist;
        onUpdateHUD(this.score, 1);
    },

    draw: function(theme) {
        // Clear
        this.ctx.fillStyle = theme.bg;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // --- GAME WORLD ---
        this.ctx.save();
        this.ctx.scale(this.zoom, this.zoom);
        this.ctx.translate(-this.camera.x, -this.camera.y);

        // 1. Draw Track
        this.ctx.strokeStyle = theme.brick;
        this.ctx.lineWidth = 8;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        this.ctx.beginPath();
        // Optimization: Draw only visible segments
        let startIdx = Math.max(0, Math.floor(this.camera.x / this.segmentWidth));
        let endIdx = Math.min(this.track.length, startIdx + Math.ceil(this.canvas.width / this.zoom / this.segmentWidth) + 2);
        
        if (this.track.length > 0) {
            this.ctx.moveTo(this.track[Math.max(0, startIdx-1)].x, this.track[Math.max(0, startIdx-1)].y);
            for(let i=startIdx; i<endIdx; i++) {
                this.ctx.lineTo(this.track[i].x, this.track[i].y);
            }
        }
        this.ctx.stroke();

        // 2. Finish Line
        let finishX = this.track[this.track.length - 20].x;
        let finishY = this.track[this.track.length - 20].y;
        this.drawCheckeredFlag(finishX, finishY);

        // 3. Draw Bike (Block Style)
        const b = this.bike;
        this.ctx.translate(b.x, b.y);
        this.ctx.rotate(b.angle);

        // Block Chassis
        this.ctx.fillStyle = theme.paddleNormal;
        this.ctx.shadowBlur = 15;
        this.ctx.shadowColor = theme.paddleNormal;
        this.ctx.fillRect(-18, -12, 36, 12); // Main block
        this.ctx.shadowBlur = 0;

        // Block Wheels
        this.ctx.fillStyle = '#111';
        this.ctx.strokeStyle = theme.text;
        this.ctx.lineWidth = 3;
        
        this.ctx.beginPath(); this.ctx.arc(-18, 12, 10, 0, Math.PI*2); 
        this.ctx.fill(); this.ctx.stroke(); // Rear
        
        this.ctx.beginPath(); this.ctx.arc(18, 12, 10, 0, Math.PI*2); 
        this.ctx.fill(); this.ctx.stroke(); // Front

        // Block Head
        this.ctx.fillStyle = theme.text;
        this.ctx.fillRect(-8, -26, 14, 14);

        this.ctx.restore();

        // --- UI OVERLAYS ---
        // Custom Start Menu inside Canvas
        if (this.state === 'MENU') {
            this.ctx.fillStyle = "rgba(0,0,0,0.7)";
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            this.ctx.fillStyle = theme.text;
            this.ctx.textAlign = "center";
            
            this.ctx.font = "bold 40px Arial";
            this.ctx.fillText("NEON MOTO", this.canvas.width/2, this.canvas.height/2 - 30);
            
            this.ctx.font = "20px Arial";
            this.ctx.fillText("TAP OR PRESS UP TO START", this.canvas.width/2, this.canvas.height/2 + 20);
        } 
        else if (this.state === 'WON') {
            this.drawCenterText("COURSE COMPLETED!", "#00FF00");
        } 
        else if (this.state === 'CRASHED') {
            this.drawCenterText("CRASHED!", "#FF0000");
        }
    },

    drawCheckeredFlag: function(x, y) {
        this.ctx.fillStyle = '#FFF';
        this.ctx.fillRect(x, y - 120, 5, 120); // Pole
        // Flag
        for (let r=0; r<4; r++) {
            for (let c=0; c<6; c++) {
                this.ctx.fillStyle = ((r+c)%2===0) ? '#FFF' : '#000';
                this.ctx.fillRect(x + 5 + c*10, y - 120 + r*10, 10, 10);
            }
        }
    },

    drawCenterText: function(text, color) {
        this.ctx.save();
        this.ctx.fillStyle = color;
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = color;
        this.ctx.font = "bold 40px Arial";
        this.ctx.textAlign = "center";
        this.ctx.fillText(text, this.canvas.width/2, this.canvas.height/2);
        this.ctx.restore();
    }
};