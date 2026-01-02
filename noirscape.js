// =========================================
// NOIRSCAPE ENGINE (Restored Best Version)
// =========================================

const NoirGame = {
    // State
    active: false,
    score: 0,
    coins: 0,
    totalCoins: parseInt(localStorage.getItem('zenith_coins')) || 0,
    lives: 1,
    
    // Physics
    speed: 15,    
    maxSpeed: 40,
    distance: 0,
    
    // 3D Config
    laneWidth: 0, 
    fov: 800,
    cameraHeight: 0, 
    horizonY: 0,
    playerZ: 200, // Keeps player visible
    
    // Player
    player: { lane: 0, y: 0, state: 'RUN', shootTimer: 0 },
    
    // Entities
    obstacles: [],
    coinsList: [],
    bullets: [],
    enemyBullets: [],
    
    // Refs
    canvas: null,
    ctx: null,

    // --- SETUP ---
    init: function(canvasElement, context) {
        this.canvas = canvasElement;
        this.ctx = context;
        this.active = true;
        this.score = 0;
        this.coins = 0;
        
        // RESET SPEED
        this.speed = 15; 
        this.distance = 0;
        
        this.player.lane = 0;
        this.player.y = 0;
        this.player.state = 'RUN';
        
        this.obstacles = [];
        this.coinsList = [];
        this.bullets = [];
        this.enemyBullets = [];
        
        // RESPONSIVE CAMERA
        const H = this.canvas.height;
        const W = this.canvas.width;
        this.horizonY = H * 0.4;       
        this.cameraHeight = H * 0.5;   
        this.laneWidth = W * 0.15;     

        // Spawn Safe Zone
        for(let i=0; i<5; i++) {
            this.spawnLevel(2000 + (i*1500));
        }
    },

    // --- SPAWN LOGIC ---
    spawnLevel: function(zDist) {
        const lane = Math.floor(Math.random() * 3) - 1; 
        const rand = Math.random();
        
        let type = 'BLOCK'; 
        if (rand > 0.65) type = 'MONSTER'; 
        else if (rand > 0.45) type = 'BEAM'; 
        else if (rand > 0.25) type = 'SPIKE';

        this.obstacles.push({
            type: type,
            lane: lane,
            z: zDist,
            alive: true,
            width: this.laneWidth * 0.8,
            height: type === 'BEAM' ? 140 : 80,
            attackTimer: Math.random() * 100
        });

        // Add Coins
        for(let l = -1; l <= 1; l++) {
            if (l !== lane && Math.random() > 0.6) {
                this.coinsList.push({ lane: l, z: zDist, collected: false });
            }
        }
    },

    // --- 3D MATH ---
    project3D: function(lane, yWorld, z) {
        const scale = this.fov / (this.fov + z);
        const centerX = this.canvas.width / 2;
        const x = centerX + (lane * this.laneWidth * scale);
        const y = this.horizonY + (this.cameraHeight * scale) - (yWorld * scale);
        const visible = z > -this.fov + 50;
        return { x: x, y: y, scale: scale, visible: visible };
    },

    // --- UPDATE LOOP ---
    update: function(callbacks) {
        if (!this.active) return;

        // 1. Move World
        this.distance += this.speed;
        this.score = Math.floor(this.distance / 10);
        
        // STRICT SPEED CONTROL
        if (this.speed < this.maxSpeed) {
            this.speed = 15 + (this.score / 2000); 
        }

        if(this.player.shootTimer > 0) this.player.shootTimer--;

        // 2. Player Physics
        if (this.player.state === 'JUMP') {
            this.player.timer--;
            this.player.y = 200 * Math.sin((Math.PI * this.player.timer) / 25); 
            if (this.player.timer <= 0) {
                this.player.state = 'RUN';
                this.player.y = 0;
            }
        } else if (this.player.state === 'SLIDE') {
            this.player.timer--;
            if (this.player.timer <= 0) this.player.state = 'RUN';
        }

        // 3. Spawn Manager
        if(this.obstacles.length > 0 && this.obstacles[this.obstacles.length-1].z < 4000) {
            this.spawnLevel(this.obstacles[this.obstacles.length-1].z + 1200);
        }

        // 4. Update Player Bullets
        for(let i = this.bullets.length -1; i>=0; i--) {
            let b = this.bullets[i];
            b.z += 100; 
            
            // Check Hits
            for(let o of this.obstacles) {
                if(o.type === 'MONSTER' && o.alive && o.lane === b.lane) {
                    if(b.z > o.z - 150 && b.z < o.z + 150) {
                        o.alive = false; 
                        this.bullets.splice(i, 1);
                        break;
                    }
                }
            }
            if(b.z > 6000) this.bullets.splice(i, 1);
        }

        // 5. Update Enemy Bullets
        for(let i = this.enemyBullets.length -1; i>=0; i--) {
            let eb = this.enemyBullets[i];
            eb.z -= (this.speed + 12); 

            if (eb.z < this.playerZ + 50 && eb.z > this.playerZ - 50 && this.player.lane === eb.lane) {
                if (this.player.y < 80) { 
                    this.gameOver(callbacks);
                    return;
                }
            }
            if(eb.z < -this.fov) this.enemyBullets.splice(i, 1);
        }

        // 6. Update Obstacles
        for(let i = this.obstacles.length - 1; i >= 0; i--) {
            let obs = this.obstacles[i];
            obs.z -= this.speed;

            // Monster Attack Logic
            if(obs.type === 'MONSTER' && obs.alive) {
                obs.attackTimer--;
                if(obs.attackTimer <= 0 && obs.z < 3000 && obs.z > 500) {
                    this.enemyBullets.push({ lane: obs.lane, z: obs.z });
                    obs.attackTimer = 120; 
                }
            }

            // Collision Check
            if (obs.z < this.playerZ + 60 && obs.z > this.playerZ - 60 && this.player.lane === obs.lane) {
                if(obs.type === 'MONSTER' && !obs.alive) continue; 

                let hit = false;
                if (obs.type === 'BLOCK' || obs.type === 'MONSTER') hit = true; 
                if (obs.type === 'SPIKE' && this.player.y < 50) hit = true;
                if (obs.type === 'BEAM' && this.player.state !== 'SLIDE') hit = true;

                if (hit) {
                    this.gameOver(callbacks);
                    return;
                }
            }
            if(obs.z < -this.fov) this.obstacles.splice(i, 1);
        }

        // 7. Coins
        for(let i = this.coinsList.length - 1; i >= 0; i--) {
            let c = this.coinsList[i];
            c.z -= this.speed;
            if (!c.collected && c.z < this.playerZ + 60 && c.z > this.playerZ - 60 && this.player.lane === c.lane) {
                c.collected = true;
                this.coins++;
                this.totalCoins++;
                localStorage.setItem('zenith_coins', this.totalCoins);
            }
            if(c.z < -this.fov) this.coinsList.splice(i, 1);
        }

        if(callbacks.onUpdateHUD) callbacks.onUpdateHUD(this.score, this.lives, this.coins);
    },

    // --- ACTIONS ---
    action: function(act) {
        if (act === 'LEFT') this.player.lane = Math.max(-1, this.player.lane - 1);
        if (act === 'RIGHT') this.player.lane = Math.min(1, this.player.lane + 1);
        
        if (act === 'UP' && this.player.state === 'RUN') {
            this.player.state = 'JUMP';
            this.player.timer = 25;
        }
        
        if (act === 'DOWN') {
            this.player.state = 'SLIDE';
            this.player.y = 0;
            this.player.timer = 30;
        }

        if (act === 'SHOOT' && this.player.shootTimer === 0) {
            this.bullets.push({ lane: this.player.lane, z: this.playerZ });
            this.player.shootTimer = 20;
        }
    },

    gameOver: function(callbacks) {
        this.active = false;
        if(callbacks.onGameOver) callbacks.onGameOver(this.score);
    },

    // --- DRAW LOOP ---
    draw: function() {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const cvs = this.canvas;

        // Background
        ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, cvs.width, cvs.height);
        const hY = this.horizonY;
        ctx.fillStyle = '#111'; ctx.fillRect(0, hY, cvs.width, cvs.height - hY);

        // Grid
        ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
        [-1.5, -0.5, 0.5, 1.5].forEach(lx => {
            let pFar = this.project3D(lx, 0, 8000); let pNear = this.project3D(lx, 0, 0);
            ctx.beginPath(); ctx.moveTo(pFar.x, pFar.y); ctx.lineTo(pNear.x, pNear.y); ctx.stroke();
        });

        // Entities
        this.drawEntities(ctx);

        // Player Bullets
        ctx.strokeStyle = '#00FF00'; ctx.lineWidth = 4;
        this.bullets.forEach(b => {
            let p1 = this.project3D(b.lane, 50, b.z);
            let p2 = this.project3D(b.lane, 50, b.z + 120); 
            if(p1.visible) {
                ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
            }
        });

        // Enemy Bullets
        this.enemyBullets.forEach(eb => {
            let p = this.project3D(eb.lane, 60, eb.z);
            if(p.visible && p.scale > 0) {
                let r = 25 * p.scale;
                ctx.fillStyle = '#FF0000'; 
                ctx.shadowBlur = 20; ctx.shadowColor = 'red';
                ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI*2); ctx.fill();
                ctx.shadowBlur = 0;
            }
        });

        // Player
        let p = this.project3D(this.player.lane, this.player.y, this.playerZ);
        let r = 35 * p.scale; 
        
        let scaleY = 1;
        if (this.player.state === 'SLIDE') scaleY = 0.5;

        // Player Body
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowBlur = 30; ctx.shadowColor = '#00FFFF'; 
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - (r*scaleY), r, r * scaleY, 0, 0, Math.PI*2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Gun Indicator
        ctx.fillStyle = '#00FF00';
        ctx.beginPath(); ctx.arc(p.x + (r*0.6), p.y - (r*scaleY), 8*p.scale, 0, Math.PI*2); ctx.fill();

        // UI
        ctx.fillStyle = '#FFD700'; ctx.font = "bold 20px Arial"; ctx.textAlign = "right";
        ctx.fillText(`💰 ${this.totalCoins}`, cvs.width - 20, 40);
        
        if(this.distance < 500) {
            ctx.font = "14px Arial"; ctx.fillStyle = '#AAA'; ctx.textAlign = "center";
            ctx.fillText("SPACE TO SHOOT", cvs.width/2, hY - 20);
        }
    },

    drawEntities: function(ctx) {
        const all = [...this.obstacles, ...this.coinsList].sort((a,b) => b.z - a.z);

        all.forEach(obj => {
            // Coins
            if(obj.collected !== undefined) { 
                if(!obj.collected) {
                    let p = this.project3D(obj.lane, 50, obj.z);
                    if(p.visible && p.scale > 0) {
                        ctx.fillStyle = '#FFD700';
                        ctx.beginPath(); ctx.arc(p.x, p.y, 15 * p.scale, 0, Math.PI*2); ctx.fill();
                    }
                }
                return;
            }

            // Obstacles
            let yOff = (obj.type === 'BEAM') ? 120 : 0;
            let p = this.project3D(obj.lane, yOff, obj.z);
            
            if(p.visible && p.scale > 0) {
                let w = obj.width * p.scale;
                let h = obj.height * p.scale;

                if (obj.type === 'MONSTER') {
                    if (obj.alive) {
                        // Original Clean Look
                        ctx.fillStyle = '#300'; ctx.strokeStyle = '#F00'; ctx.lineWidth = 2;
                        ctx.fillRect(p.x - w/2, p.y - h, w, h);
                        ctx.strokeRect(p.x - w/2, p.y - h, w, h);
                        ctx.fillStyle = '#F00'; ctx.shadowBlur = 15; ctx.shadowColor = 'red';
                        ctx.beginPath(); ctx.arc(p.x, p.y - h/2, 10*p.scale, 0, Math.PI*2); ctx.fill();
                        ctx.shadowBlur = 0;
                    }
                } else if (obj.type === 'SPIKE') {
                    ctx.fillStyle = '#000'; ctx.strokeStyle = '#F08'; ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.moveTo(p.x - w/2, p.y);
                    ctx.lineTo(p.x, p.y - h);
                    ctx.lineTo(p.x + w/2, p.y);
                    ctx.closePath();
                    ctx.fill(); ctx.stroke();
                } else if (obj.type === 'BEAM') {
                    ctx.strokeStyle = '#0FF'; ctx.lineWidth = 4;
                    ctx.strokeRect(p.x - w/2, p.y - h, w, h);
                } else {
                    ctx.fillStyle = '#111'; ctx.strokeStyle = '#FFF'; ctx.lineWidth = 3;
                    ctx.fillRect(p.x - w/2, p.y - h, w, h);
                    ctx.strokeRect(p.x - w/2, p.y - h, w, h);
                }
            }
        });
    }
};