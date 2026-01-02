document.addEventListener('DOMContentLoaded', () => {

    // --- CONFIGURATION ---
    const CONFIG = {
        baseSpeed: 8.5,       
        maxBallSpeed: 18,     
        paddleWidth: 200,     
        paddleSmoothing: 0.2, 
        brickRows: 50,
        brickCols: 80,
        trailLength: 12,
        powerUpChance: 0.04   
    };

    // --- THEMES (UPDATED WITH PACMAN COLORS) ---
    const THEMES = {
        dark: {
            bg: '#050505',
            grid: 'rgba(0, 136, 255, 0.1)',
            ball: '#FFFFFF',
            ballShadow: '#FFF',
            brick: '#00AAFF',
            paddleLaser: '#FF00FF',
            paddleNormal: '#FF8800',
            trailBase: 'rgba(255, 255, 255, 0.2)',
            plasma: '#FF0000',
            blendMode: 'lighter',
            text: '#FFF',
            // PACMAN SPECIFIC
            pacWall: '#0055FF',
            pacDot: '#FFB8AE',
            pacPlayer: '#FFFF00',
            pacGhost: ['#FF0000', '#FFB8FF', '#00FFFF', '#FFB852'] // Red, Pink, Cyan, Orange
        },
        light: {
            bg: '#F0F4F8',
            grid: 'rgba(0, 0, 0, 0.1)',
            ball: '#1A202C',
            ballShadow: 'transparent',
            brick: '#3182CE',
            paddleLaser: '#D500F9',
            paddleNormal: '#FF6D00',
            trailBase: 'rgba(0, 0, 0, 0.1)',
            plasma: '#D50000',
            blendMode: 'source-over',
            text: '#1A202C',
            // PACMAN SPECIFIC
            pacWall: '#2D3748',
            pacDot: '#A0AEC0',
            pacPlayer: '#F6AD55',
            pacGhost: ['#E53E3E', '#D53F8C', '#3182CE', '#DD6B20'] // Darker Tones
        }
    };

    // --- GAME LIBRARY ---
    const games = [
        { id: 99, title: "Run-Shooter", cat: "Shooter", type: "internal_noir", icon: "🔳" },
        { id: 0, title: "Let's Break", cat: "Exclusive", type: "internal_brick", icon: "💎" },
        { id: 100, title: "Pac-Man", cat: "Retro", type: "internal_pacman", icon: "👻" },
        { id: 101, title: "Moto", cat: "Balancing", type: "internal_moto", icon: "🏍️" },
    ];

    // --- DOM ---
    const grid = document.getElementById('grid');
    const modal = document.getElementById('app-modal');
    const iframe = document.getElementById('game-iframe');
    const internalWrapper = document.getElementById('internal-wrapper');
    const titleLabel = document.getElementById('active-game-title');
    const globalScoreEl = document.getElementById('global-high-score');
    const themeBtn = document.getElementById('theme-toggle');
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas ? canvas.getContext('2d') : null;

    // --- STATE ---
    let animationId;
    let state = 'MENU';
    let activeGameMode = null; 
    let score = 0, lives = 3;
    let highScore = localStorage.getItem('zenith_highscore') || 0;
    let currentTheme = localStorage.getItem('zenith_theme') || 'dark';
    
    // --- ENTITIES (Neon Swarm) ---
    let balls = []; 
    let powerups = [];
    let lasers = [];
    let paddle = { x: 0, w: CONFIG.paddleWidth, h: 14, laserTimer: 0, targetX: 0 };
    let bricks = [];
    let particles = [];
    let bgOffset = 0;
    let ballAttached = true; 
    let launchPressed = false;

    // --- INPUTS ---
    let keys = { up: false, down: false, left: false, right: false, space: false };
    let rightPressed = false, leftPressed = false;
    let touchX = null;
    let touchStartX = 0, touchStartY = 0; 

    // --- THEME ENGINE ---
    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('zenith_theme', theme);
        currentTheme = theme;
        if(themeBtn) themeBtn.innerHTML = theme === 'dark' ? '<span class="icon">☀</span>' : '<span class="icon">☾</span>';
        
        // Force Redraw
        if(state === 'MENU' && ctx) {
            if(activeGameMode === 'brick') drawBrick();
            if(activeGameMode === 'pacman') PacmanEngine.draw(THEMES[currentTheme]);
        }
    }
    
    if(themeBtn) {
        setTheme(currentTheme);
        themeBtn.addEventListener('click', () => setTheme(currentTheme === 'light' ? 'dark' : 'light'));
    }

    // --- INIT ---
    function init() {
        if(grid) {
            document.getElementById('library-count').innerText = `${games.length} Cartridges Loaded`;
            grid.innerHTML = '';
            games.forEach(game => {
                const card = document.createElement('div');
                card.className = 'game-card';
                card.innerHTML = `<div class="card-thumb">${game.icon}</div><div class="card-info"><div class="card-title">${game.title}</div><div class="card-tag">${game.cat}</div></div>`;
                card.onclick = () => launchGame(game);
                grid.appendChild(card);
            });
        }
        if(globalScoreEl) globalScoreEl.innerText = highScore;
    }

    function launchGame(game) {
        if(animationId) cancelAnimationFrame(animationId);
        modal.classList.add('open'); modal.style.display = 'flex'; 
        titleLabel.innerText = game.title;
        
        if (game.type === 'external') {
            iframe.style.display = 'block'; 
            internalWrapper.style.display = 'none';
            iframe.src = game.url; 
            activeGameMode = 'external';
        } else {
            iframe.style.display = 'none'; 
            internalWrapper.style.display = 'block';
            iframe.src = "";
            
            if (game.type === 'internal_noir') { 
                activeGameMode = 'noir'; 
                initNoirGame(); 
            } else if (game.type === 'internal_pacman') {
                activeGameMode = 'pacman';
                initPacmanGame();
            } else if (game.type === 'internal_moto') { 
                activeGameMode = 'moto';
                initMotoGame();
            } else { 
                activeGameMode = 'brick'; 
                initBrickGame(); 
            }
        }
    }

    function closeGame() {
        modal.classList.remove('open');
        setTimeout(() => { modal.style.display = 'none'; iframe.src = ""; state = 'MENU'; cancelAnimationFrame(animationId); }, 300);
    }

    function resizeCanvas() {
        const rect = internalWrapper.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
    }

    // --- MASTER GAME LOOP ---
    function gameLoop() {
        if(state !== 'PLAYING') return;
        
        if (activeGameMode === 'brick') { 
            updateBrick(); 
            drawBrick(); 
        } else if (activeGameMode === 'pacman') {
            if(typeof PacmanEngine !== 'undefined') {
                PacmanEngine.update(keys, (s)=>{ score=s; gameOver(); }, (s, l)=>{ score=s; lives=l; updateHUD(); });
                PacmanEngine.draw(THEMES[currentTheme]);
            }
        } else if (activeGameMode === 'moto') { // <--- ADD THIS BLOCK
            if(typeof MotoEngine !== 'undefined') {
                MotoEngine.update(keys, (s)=>{ score=s; gameOver(); }, (s, l)=>{ score=s; lives=l; updateHUD(); });
                MotoEngine.draw(THEMES[currentTheme]);
            }
        } else if (activeGameMode === 'noir') {
            if(typeof NoirGame !== 'undefined') {
                NoirGame.update({ 
                    onGameOver: (s) => { score = s; gameOver(); }, 
                    onUpdateHUD: (s, l) => { score = s; lives = l; updateHUD(); }
                });
                NoirGame.draw();
            }
        }
        animationId = requestAnimationFrame(gameLoop);
    }

    // --- ENGINE INITIALIZERS ---
    function initNoirGame() {
        if(!canvas) return; 
        resizeCanvas();
        if(typeof NoirGame !== 'undefined') { 
            NoirGame.init(canvas, ctx); 
            state = 'MENU'; 
            toggleScreen('screen-start'); 
            document.querySelector('#screen-start .hero-text').innerText = "Run-Shooter";
            document.querySelector('#screen-start .sub-text').innerText = "ရှောင်ရန် ကီးဘုတ်မြှား(သို့)ပွတ်ဆွဲပါ";
            updateHUD();
            NoirGame.draw(); 
        } else alert("NoirGame engine not found!"); 
    }

    function initPacmanGame() {
        if(!canvas) return; 
        resizeCanvas();
        if(typeof PacmanEngine !== 'undefined') { 
            PacmanEngine.init(canvas, ctx); 
            state = 'MENU'; 
            score = 0; lives = 3;
            toggleScreen('screen-start'); 
            document.querySelector('#screen-start .hero-text').innerText = "PAC-MAN";
            document.querySelector('#screen-start .sub-text').innerText = "ဘတစ်ပြန်ကျားတစ်ပြန် သတ်မလားသေမလား";
            updateHUD();
            PacmanEngine.draw(THEMES[currentTheme]); 
        } else alert("PacmanEngine not found! Make sure pacman.js is linked."); 
    }

    function initMotoGame() {
        if(!canvas) return; 
        resizeCanvas();
        if(typeof MotoEngine !== 'undefined') { 
            MotoEngine.init(canvas, ctx); 
            state = 'MENU'; 
            score = 0; lives = 1;
            toggleScreen('screen-start'); 
            
            document.querySelector('#screen-start .hero-text').innerText = "MOTO";
            document.querySelector('#screen-start .sub-text').innerText = "မမှောက်ပါစေနဲ့ ဂျွမ်းတော့ပစ်နိုင်အောင်ပစ်သွား";
            updateHUD();
            MotoEngine.draw(THEMES[currentTheme]); 
        } else alert("MotoEngine not found!"); 
    }

    function initBrickGame() {
        if(!canvas) return;
        resizeCanvas();
        state = 'MENU';
        score = 0; lives = 3;
        particles = []; powerups = []; lasers = []; balls = [];
        
        toggleScreen('screen-start');
        document.querySelector('#screen-start .hero-text').innerText = "Let's Break";
        document.querySelector('#screen-start .sub-text').innerText = "ဖျက်စီးကြမယ် မျက်စိလျင်လျင်ထားပါ";
        updateHUD();
        
        paddle.x = (canvas.width - paddle.w) / 2;
        paddle.targetX = paddle.x;
        
        generateLevel();
        spawnBall(canvas.width / 2, canvas.height - 80); 
        ballAttached = true; 
        
        drawBrick();
    }

    // --- BRICK LOGIC & HELPERS ---
    function generateLevel() {
        bricks = [];
        const cols = CONFIG.brickCols;
        const rows = CONFIG.brickRows;
        const padding = 1; 
        const offsetTop = 10; 
        const offsetLeft = 5;
        const brickW = (canvas.width - (offsetLeft * 2) - (padding * (cols-1))) / cols;
        const maxGridHeight = canvas.height * 0.25; 
        let brickH = (maxGridHeight - offsetTop) / rows;
        if (brickH < 3) brickH = 3; 

        for(let c=0; c<cols; c++) {
            bricks[c] = [];
            for(let r=0; r<rows; r++) {
                bricks[c][r] = { x: c*(brickW+padding)+offsetLeft, y: r*(brickH+padding)+offsetTop, w: brickW, h: brickH, status: 1 };
            }
        }
    }

    function spawnBall(x, y, dx, dy) {
        if(balls.length > 50) return; 
        let speed = CONFIG.baseSpeed;
        if (dx === undefined) dx = 0; 
        if (dy === undefined) dy = 0;
        
        balls.push({ x: x, y: y, dx: dx, dy: dy, r: 4, speed: speed, trail: [], isPlasma: false });
    }

    function spawnPowerup(x, y) {
        const rand = Math.random();
        let type = 'MULTIBALL'; let color = '#00FF00'; 
        if (rand < 0.4) { type = 'LASER'; color = '#FF00FF'; } 
        else if (rand < 0.7) { type = 'PLASMA'; color = '#FF0000'; } 
        powerups.push({ x: x, y: y, type: type, color: color, dy: 3, w: 15, h: 15 });
    }

    function spawnParticles(x, y, color) {
        if(particles.length > 100) return;
        for(let i=0; i<4; i++) {
            particles.push({ x: x, y: y, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8, life: 1.0, color: color, size: Math.random() * 3 + 1 });
        }
    }

    function updateBrick() {
        bgOffset = (bgOffset + 0.5) % 40; 

        if(touchX !== null) { paddle.targetX = touchX - paddle.w / 2; } 
        else { if(rightPressed) paddle.targetX += 20; if(leftPressed) paddle.targetX -= 20; }
        
        if(paddle.targetX < 0) paddle.targetX = 0;
        if(paddle.targetX > canvas.width - paddle.w) paddle.targetX = canvas.width - paddle.w;
        paddle.x += (paddle.targetX - paddle.x) * CONFIG.paddleSmoothing;

        if (ballAttached && balls.length > 0) {
            let b = balls[0];
            b.x = paddle.x + paddle.w / 2;
            b.y = canvas.height - paddle.h - 10 - b.r;
            b.dx = 0; b.dy = 0;
            if (launchPressed) {
                ballAttached = false; launchPressed = false;
                b.dx = (Math.random() - 0.5) * 4; b.dy = -CONFIG.baseSpeed;
            }
        }

        if (paddle.laserTimer > 0) {
            paddle.laserTimer--;
            if (paddle.laserTimer % 10 === 0) { 
                lasers.push({ x: paddle.x + 10, y: canvas.height - 30, dy: -12 });
                lasers.push({ x: paddle.x + paddle.w - 10, y: canvas.height - 30, dy: -12 });
            }
        }

        for(let i = lasers.length - 1; i >= 0; i--) {
            let l = lasers[i]; l.y += l.dy; if (l.y < 0) { lasers.splice(i, 1); continue; }
            let hit = false;
            for(let c=0; c<bricks.length; c++) {
                for(let r=0; r<bricks[c].length; r++) {
                    let b = bricks[c][r];
                    if(b.status === 1 && l.x > b.x && l.x < b.x + b.w && l.y > b.y && l.y < b.y + b.h) {
                        b.status = 0; score += 5; hit = true;
                        spawnParticles(b.x, b.y, THEMES[currentTheme].paddleLaser);
                        if(Math.random() < CONFIG.powerUpChance) spawnPowerup(b.x, b.y);
                        break;
                    }
                }
                if(hit) break;
            }
            if(hit) lasers.splice(i, 1);
        }

        for(let i = powerups.length - 1; i >= 0; i--) {
            let p = powerups[i]; p.y += p.dy;
            if(p.y + p.h >= canvas.height - paddle.h - 10 && p.y < canvas.height && p.x + p.w >= paddle.x && p.x <= paddle.x + paddle.w) {
                activatePowerup(p.type); powerups.splice(i, 1);
            } else if (p.y > canvas.height) { powerups.splice(i, 1); }
        }

        if(balls.length === 0) {
            lives--; shakeScreen(); updateHUD();
            if(lives <= 0) { gameOver(); } 
            else { spawnBall(paddle.x + paddle.w / 2, canvas.height - 80); ballAttached = true; launchPressed = false; }
        }

        for(let i = balls.length - 1; i >= 0; i--) {
            let b = balls[i];
            if(ballAttached && i === 0) continue; 

            b.trail.push({x: b.x, y: b.y});
            if(b.trail.length > CONFIG.trailLength) b.trail.shift();

            b.x += b.dx;
            if(b.x > canvas.width - b.r) { b.x = canvas.width - b.r; b.dx = -b.dx; }
            if(b.x < b.r) { b.x = b.r; b.dx = -b.dx; }
            checkBrickCollision(b, true); 

            b.y += b.dy;
            if(b.y < b.r) { b.y = b.r; b.dy = -b.dy; }

            if(b.dy > 0 && b.y + b.r >= canvas.height - paddle.h - 10 && b.y - b.r < canvas.height && b.x >= paddle.x && b.x <= paddle.x + paddle.w) {
                b.y = canvas.height - paddle.h - 10 - b.r; 
                let hitPoint = (b.x - (paddle.x + paddle.w/2)) / (paddle.w/2);
                let angle = hitPoint * (Math.PI / 3); 
                if (b.speed < CONFIG.maxBallSpeed) b.speed *= 1.02;
                b.dx = b.speed * Math.sin(angle);
                b.dy = -b.speed * Math.cos(angle);
            }
            checkBrickCollision(b, false);

            if(b.y - b.r > canvas.height) balls.splice(i, 1); 
        }

        for(let i = particles.length - 1; i >= 0; i--) { let p = particles[i]; p.x += p.vx; p.y += p.vy; p.life -= 0.05; if(p.life <= 0) particles.splice(i, 1); }
    }

    function checkBrickCollision(b, checkingX) {
        for(let c=0; c<bricks.length; c++) {
            for(let r=0; r<bricks[c].length; r++) {
                let br = bricks[c][r];
                if(br.status === 1) {
                    if(b.x + b.r > br.x && b.x - b.r < br.x + br.w && b.y + b.r > br.y && b.y - b.r < br.y + br.h) {
                        br.status = 0; score += 10;
                        spawnParticles(br.x + br.w/2, br.y + br.h/2, THEMES[currentTheme].brick);
                        if(Math.random() < CONFIG.powerUpChance) spawnPowerup(br.x, br.y);
                        
                        if (b.isPlasma) { spawnParticles(br.x, br.y, '#FF0000'); return; }

                        if (checkingX) { if (b.dx > 0) b.x = br.x - b.r; else b.x = br.x + br.w + b.r; b.dx = -b.dx; } 
                        else { if (b.dy > 0) b.y = br.y - b.r; else b.y = br.y + br.h + b.r; b.dy = -b.dy; }
                        return; 
                    }
                }
            }
        }
    }

    function activatePowerup(type) {
        if (type === 'MULTIBALL') {
            if(ballAttached) { ballAttached = false; balls[0].dy = -CONFIG.baseSpeed; }
            let len = balls.length;
            for(let i=0; i<len; i++) {
                let parent = balls[i];
                spawnBall(parent.x, parent.y, parent.dx + 2, parent.dy);
                spawnBall(parent.x, parent.y, parent.dx - 2, parent.dy);
            }
        } else if (type === 'LASER') { paddle.laserTimer = 400; } 
        else if (type === 'PLASMA') {
            spawnBall(paddle.x + paddle.w/2, canvas.height - 50, 0, -10);
            let pb = balls[balls.length-1]; pb.isPlasma = true; pb.r = 6;
            if(ballAttached) ballAttached = false; 
        }
        updateHUD();
    }

    function drawBrick() {
        const theme = THEMES[currentTheme];
        ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.strokeStyle = theme.grid; ctx.lineWidth = 1;
        for(let y = bgOffset; y < canvas.height; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
        for(let x = 0; x < canvas.width; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }

        const paddleColor = paddle.laserTimer > 0 ? theme.paddleLaser : theme.paddleNormal; 
        ctx.fillStyle = paddleColor; ctx.shadowBlur = 20; ctx.shadowColor = paddleColor;
        ctx.fillRect(paddle.x, canvas.height - paddle.h - 10, paddle.w, paddle.h); ctx.shadowBlur = 0;

        balls.forEach(b => {
            if(b.trail.length > 0) {
                ctx.strokeStyle = b.isPlasma ? theme.plasma : theme.trailBase;
                ctx.lineWidth = b.r * 2; ctx.lineCap = 'round';
                ctx.beginPath(); ctx.moveTo(b.trail[0].x, b.trail[0].y);
                for(let i=1; i<b.trail.length; i++) ctx.lineTo(b.trail[i].x, b.trail[i].y);
                ctx.stroke();
            }
            ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
            ctx.fillStyle = b.isPlasma ? theme.plasma : theme.ball;
            ctx.shadowBlur = 10; ctx.shadowColor = theme.ballShadow;
            ctx.fill(); ctx.closePath(); ctx.shadowBlur = 0;
        });

        powerups.forEach(p => {
            ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#000'; ctx.font = "10px Arial"; ctx.textAlign = "center";
            let sym = p.type==='MULTIBALL'?'M':(p.type==='LASER'?'L':'P');
            ctx.fillText(sym, p.x, p.y+3);
        });

        ctx.fillStyle = theme.paddleLaser; lasers.forEach(l => { ctx.fillRect(l.x, l.y, 4, 15); });
        ctx.fillStyle = theme.brick; bricks.forEach(col => { col.forEach(b => { if(b.status === 1) { ctx.fillRect(b.x, b.y, b.w, b.h); } }); });

        ctx.globalCompositeOperation = theme.blendMode;
        particles.forEach(p => {
            ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
            ctx.globalAlpha = 1.0;
        });
        ctx.globalCompositeOperation = 'source-over';
        
        if(ballAttached && state === 'PLAYING') {
            ctx.fillStyle = currentTheme === 'dark' ? '#FFF' : '#333';
            ctx.font = "bold 16px Outfit, Arial"; ctx.textAlign = "center";
            ctx.fillText("TAP OR CLICK TO LAUNCH", paddle.x + paddle.w/2, canvas.height - 40);
        }
    }

    function updateHUD() {
        document.getElementById('hud-score').innerText = score;
        document.getElementById('hud-lives').innerText = activeGameMode==='noir' ? (lives>0?"RUNNING":"DEAD") : "❤️".repeat(lives);
    }

    function toggleScreen(screenId) {
        document.querySelectorAll('.overlay').forEach(el => el.classList.remove('active'));
        if(screenId) document.getElementById(screenId).classList.add('active');
    }

    function gameOver() {
        state = 'GAMEOVER';
        if(score > highScore) { highScore = score; localStorage.setItem('zenith_highscore', highScore); globalScoreEl.innerText = highScore; }
        document.getElementById('final-score').innerText = score; toggleScreen('screen-gameover');
    }

    function shakeScreen() {
        internalWrapper.style.transform = `translate(${Math.random()*4 - 2}px, ${Math.random()*4 - 2}px)`;
        setTimeout(() => { internalWrapper.style.transform = 'none'; }, 50);
    }

    // --- INPUTS ---
    document.getElementById('modal-close-btn').addEventListener('click', closeGame);
    document.getElementById('btn-start').addEventListener('click', () => { state = 'PLAYING'; toggleScreen(null); gameLoop(); });
    document.getElementById('btn-resume').addEventListener('click', () => { state = 'PLAYING'; toggleScreen(null); gameLoop(); });
    document.getElementById('btn-restart').addEventListener('click', () => { 
        if(activeGameMode === 'noir') initNoirGame(); 
        else if(activeGameMode === 'pacman') initPacmanGame();
        else initBrickGame(); 
    });

    document.addEventListener("keydown", (e) => {
        if(e.key.toLowerCase() === 'p') { state = state === 'PLAYING' ? 'PAUSED' : 'PLAYING'; toggleScreen(state === 'PAUSED' ? 'screen-pause' : null); if(state==='PLAYING') gameLoop(); }
        
        if(e.key === "ArrowUp") keys.up = true;
        if(e.key === "ArrowDown") keys.down = true;
        if(e.key === "ArrowLeft") { keys.left = true; leftPressed = true; }
        if(e.key === "ArrowRight") { keys.right = true; rightPressed = true; }
        if(e.key === " ") { keys.space = true; if(activeGameMode === 'brick' && ballAttached) launchPressed = true; }

        if (activeGameMode === 'noir' && state === 'PLAYING') {
            if(e.key === "ArrowRight") NoirGame.action('RIGHT');
            if(e.key === "ArrowLeft") NoirGame.action('LEFT');
            if(e.key === "ArrowUp") NoirGame.action('UP');     
            if(e.key === "ArrowDown") NoirGame.action('DOWN'); 
            if(e.key === " ") { e.preventDefault(); NoirGame.action('SHOOT'); }
        }
    });
    
    document.addEventListener("keyup", (e) => {
        if(e.key === "ArrowUp") keys.up = false;
        if(e.key === "ArrowDown") keys.down = false;
        if(e.key === "ArrowLeft") { keys.left = false; leftPressed = false; }
        if(e.key === "ArrowRight") { keys.right = false; rightPressed = false; }
        if(e.key === " ") keys.space = false;
    });

    if(canvas) {
        const handleMove = (x) => {
            const rect = canvas.getBoundingClientRect();
            touchX = (x - rect.left) * (canvas.width / rect.width);
        };

        canvas.addEventListener("mousemove", (e) => { if(activeGameMode === 'brick') handleMove(e.clientX); });
        canvas.addEventListener("click", () => { if(activeGameMode === 'brick' && ballAttached) launchPressed = true; });

        canvas.addEventListener("touchstart", (e) => { 
            e.preventDefault(); 
            touchStartX = e.touches[0].clientX; 
            touchStartY = e.touches[0].clientY; 
            handleMove(e.touches[0].clientX); 
            if(activeGameMode === 'moto') {
                if (inputX > canvas.width / 2) {
                    keys.up = true; // Gas
                    keys.right = true;
                    keys.space = true;
                } else {
                    keys.down = true; // Brake
                    keys.left = true; // Lean back
                }
            }
        }, { passive: false });

        canvas.addEventListener("touchmove", (e) => { 
            e.preventDefault(); 
            handleMove(e.touches[0].clientX); 
        }, { passive: false });

        canvas.addEventListener("touchend", (e) => {
            e.preventDefault();
            if(activeGameMode === 'brick' && ballAttached) launchPressed = true; 

            // Swipe Logic
            let endX = e.changedTouches[0].clientX; let endY = e.changedTouches[0].clientY;
            let diffX = endX - touchStartX; let diffY = endY - touchStartY;

            if(Math.abs(diffX) > Math.abs(diffY)) {
                if(Math.abs(diffX) > 30) {
                    if(diffX > 0) { 
                        if(activeGameMode === 'noir') NoirGame.action('RIGHT');
                        if(activeGameMode === 'pacman') keys.right = true; 
                    } else { 
                        if(activeGameMode === 'noir') NoirGame.action('LEFT');
                        if(activeGameMode === 'pacman') keys.left = true;
                    }
                }
            } else {
                if(Math.abs(diffY) > 30) {
                    if(diffY > 0) { 
                        if(activeGameMode === 'noir') NoirGame.action('DOWN');
                        if(activeGameMode === 'pacman') keys.down = true;
                        if (activeGameMode === 'moto') {
                            keys.up = false; 
                            keys.down = false;
                            keys.left = false;
                            keys.right = false;
                        }
                    } else { 
                        if(activeGameMode === 'noir') NoirGame.action('UP');
                        if(activeGameMode === 'pacman') keys.up = true;
                    }
                } else if(activeGameMode === 'noir') {
                    NoirGame.action('SHOOT'); 
                }
            }
            // Reset Pacman keys after short delay to prevent infinite running in one dir if using swipes
            if(activeGameMode === 'pacman') setTimeout(()=>{ keys.up=false; keys.down=false; keys.left=false; keys.right=false; }, 100);
        });
    }
    init();
});
