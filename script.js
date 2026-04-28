const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

let screenW = 0;
let screenH = 0;
let dpr = 1;

function resize() {
  dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  screenW = window.innerWidth;
  screenH = window.innerHeight;

  canvas.width = Math.floor(screenW * dpr);
  canvas.height = Math.floor(screenH * dpr);
  canvas.style.width = `${screenW}px`;
  canvas.style.height = `${screenH}px`;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
}

window.addEventListener("resize", resize);
resize();

const TILE = 32;
const MAP_W = 260;
const MAP_H = 130;

const AIR = 0;
const GRASS = 1;
const DIRT = 2;
const STONE = 3;

const world = new Uint8Array(MAP_W * MAP_H);

function index(x, y) {
  return y * MAP_W + x;
}

function randomHash(x, y) {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function surfaceAt(x) {
  return Math.floor(
    16 +
      Math.sin(x * 0.055) * 3 +
      Math.sin(x * 0.16) * 2 +
      randomHash(x, 12) * 3
  );
}

function generateWorld() {
  for (let x = 0; x < MAP_W; x++) {
    const surface = surfaceAt(x);

    for (let y = 0; y < MAP_H; y++) {
      let tile = AIR;

      if (y === surface) {
        tile = GRASS;
      } else if (y > surface && y < surface + 12) {
        tile = DIRT;
      } else if (y >= surface + 12) {
        tile = STONE;
      }

      const caveNoise =
        Math.sin(x * 0.24 + y * 0.12) +
        Math.sin(x * 0.09 - y * 0.2) +
        randomHash(x * 5, y * 3);

      if (y > surface + 8 && y < MAP_H - 5 && caveNoise > 2.25) {
        tile = AIR;
      }

      if (y >= MAP_H - 3) {
        tile = STONE;
      }

      world[index(x, y)] = tile;
    }
  }
}

generateWorld();

function getTile(x, y) {
  if (y < 0) return AIR;
  if (x < 0 || x >= MAP_W || y >= MAP_H) return STONE;
  return world[index(x, y)];
}

function setTile(x, y, tile) {
  if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return;
  world[index(x, y)] = tile;
}

function isSolid(tile) {
  return tile === GRASS || tile === DIRT || tile === STONE;
}

const spawnX = Math.floor(MAP_W / 2);
const spawnY = surfaceAt(spawnX);

const player = {
  x: spawnX * TILE,
  y: (spawnY - 2) * TILE,
  w: 24,
  h: 22,
  vx: 0,
  vy: 0,
  grounded: false,
  facing: 1
};

const keys = {
  w: false,
  a: false,
  s: false,
  d: false
};

let jumpQueued = false;

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (key in keys) {
    event.preventDefault();

    if (key === "w" && !keys.w) {
      jumpQueued = true;
    }

    keys[key] = true;
  }
});

window.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();

  if (key in keys) {
    event.preventDefault();
    keys[key] = false;
  }
});

const particles = [];

function blockColor(tile) {
  if (tile === GRASS) return "#4eaa3a";
  if (tile === DIRT) return "#8b5a2b";
  if (tile === STONE) return "#6d7077";
  return "#ffffff";
}

function spawnParticles(tx, ty, tile) {
  const color = blockColor(tile);

  for (let i = 0; i < 12; i++) {
    particles.push({
      x: tx * TILE + TILE / 2,
      y: ty * TILE + TILE / 2,
      vx: (Math.random() - 0.5) * 210,
      vy: (Math.random() - 0.8) * 210,
      life: 0.45 + Math.random() * 0.25,
      size: 3 + Math.random() * 4,
      color
    });
  }
}

function digTile(tx, ty) {
  const tile = getTile(tx, ty);

  if (!isSolid(tile)) return false;

  setTile(tx, ty, AIR);
  spawnParticles(tx, ty, tile);
  return true;
}

let digCooldown = 0;

function attemptDig() {
  let dug = false;

  const left = Math.floor((player.x + 3) / TILE);
  const right = Math.floor((player.x + player.w - 3) / TILE);
  const top = Math.floor((player.y + 3) / TILE);
  const mid = Math.floor((player.y + player.h / 2) / TILE);
  const bottom = Math.floor((player.y + player.h - 3) / TILE);

  if (keys.a) {
    const tx = Math.floor((player.x - 5) / TILE);
    dug = digTile(tx, top) || dug;
    dug = digTile(tx, mid) || dug;
    dug = digTile(tx, bottom) || dug;
  }

  if (keys.d) {
    const tx = Math.floor((player.x + player.w + 5) / TILE);
    dug = digTile(tx, top) || dug;
    dug = digTile(tx, mid) || dug;
    dug = digTile(tx, bottom) || dug;
  }

  if (keys.s) {
    const ty = Math.floor((player.y + player.h + 5) / TILE);
    dug = digTile(left, ty) || dug;
    dug = digTile(right, ty) || dug;
  }

  if (keys.w) {
    const ty = Math.floor((player.y - 5) / TILE);
    dug = digTile(left, ty) || dug;
    dug = digTile(right, ty) || dug;
  }

  return dug;
}

function approach(value, target, amount) {
  if (value < target) return Math.min(value + amount, target);
  if (value > target) return Math.max(value - amount, target);
  return value;
}

function moveX(amount) {
  player.x += amount;

  if (amount > 0) {
    const tx = Math.floor((player.x + player.w) / TILE);
    const y1 = Math.floor((player.y + 2) / TILE);
    const y2 = Math.floor((player.y + player.h - 2) / TILE);

    for (let y = y1; y <= y2; y++) {
      if (isSolid(getTile(tx, y))) {
        player.x = tx * TILE - player.w - 0.01;
        player.vx = 0;
        break;
      }
    }
  } else if (amount < 0) {
    const tx = Math.floor(player.x / TILE);
    const y1 = Math.floor((player.y + 2) / TILE);
    const y2 = Math.floor((player.y + player.h - 2) / TILE);

    for (let y = y1; y <= y2; y++) {
      if (isSolid(getTile(tx, y))) {
        player.x = (tx + 1) * TILE + 0.01;
        player.vx = 0;
        break;
      }
    }
  }

  player.x = Math.max(1, Math.min(player.x, MAP_W * TILE - player.w - 1));
}

function moveY(amount) {
  player.y += amount;
  player.grounded = false;

  if (amount > 0) {
    const ty = Math.floor((player.y + player.h) / TILE);
    const x1 = Math.floor((player.x + 2) / TILE);
    const x2 = Math.floor((player.x + player.w - 2) / TILE);

    for (let x = x1; x <= x2; x++) {
      if (isSolid(getTile(x, ty))) {
        player.y = ty * TILE - player.h - 0.01;
        player.vy = 0;
        player.grounded = true;
        break;
      }
    }
  } else if (amount < 0) {
    const ty = Math.floor(player.y / TILE);
    const x1 = Math.floor((player.x + 2) / TILE);
    const x2 = Math.floor((player.x + player.w - 2) / TILE);

    for (let x = x1; x <= x2; x++) {
      if (isSolid(getTile(x, ty))) {
        player.y = (ty + 1) * TILE + 0.01;
        player.vy = 0;
        break;
      }
    }
  }
}

function update(dt) {
  const moveInput = Number(keys.d) - Number(keys.a);

  if (moveInput !== 0) {
    player.facing = moveInput;
  }

  const targetSpeed = moveInput * 265;
  const acceleration = player.grounded ? 3000 : 1600;

  player.vx = approach(player.vx, targetSpeed, acceleration * dt);

  if (moveInput === 0 && player.grounded) {
    player.vx = approach(player.vx, 0, 2400 * dt);
  }

  if (jumpQueued && player.grounded) {
    player.vy = -720;
    player.grounded = false;
  }

  jumpQueued = false;

  digCooldown -= dt;

  if (digCooldown <= 0 && attemptDig()) {
    digCooldown = 0.08;
  }

  player.vy = Math.min(player.vy + 2200 * dt, 1100);

  moveX(player.vx * dt);
  moveY(player.vy * dt);

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];

    p.life -= dt;
    p.vy += 600 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

function drawBlock(x, y, tile) {
  const px = x * TILE;
  const py = y * TILE;

  ctx.fillStyle = blockColor(tile);
  ctx.fillRect(px, py, TILE, TILE);

  if (tile === GRASS) {
    ctx.fillStyle = "#72c94b";
    ctx.fillRect(px, py, TILE, 7);

    ctx.fillStyle = "#6b4422";
    ctx.fillRect(px, py + 7, TILE, TILE - 7);
  }

  if (tile === DIRT) {
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(px + 4, py + 5, 6, 4);
    ctx.fillRect(px + 19, py + 18, 7, 3);
  }

  if (tile === STONE) {
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(px + 5, py + 7, 18, 3);

    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.fillRect(px + 8, py + 22, 16, 3);
  }

  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
}

function drawCat() {
  const x = player.x;
  const y = player.y;

  ctx.save();
  ctx.translate(x + player.w / 2, y + player.h / 2);
  ctx.scale(player.facing, 1);

  ctx.lineCap = "round";
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#d27b30";
  ctx.beginPath();
  ctx.moveTo(-9, 4);
  ctx.quadraticCurveTo(-22, -4, -14, -15);
  ctx.stroke();

  ctx.fillStyle = "#e58f3c";
  ctx.beginPath();
  ctx.ellipse(0, 4, 12, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f0a24d";
  ctx.beginPath();
  ctx.arc(8, -4, 9, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f0a24d";
  ctx.beginPath();
  ctx.moveTo(3, -10);
  ctx.lineTo(6, -20);
  ctx.lineTo(10, -10);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(11, -10);
  ctx.lineTo(16, -19);
  ctx.lineTo(17, -7);
  ctx.fill();

  ctx.fillStyle = "#2a1a12";
  ctx.fillRect(10, -6, 2, 2);
  ctx.fillRect(15, -6, 2, 2);

  ctx.fillStyle = "#fff0d0";
  ctx.fillRect(16, -1, 3, 2);

  ctx.fillStyle = "#7a461f";
  ctx.fillRect(-7, 11, 5, 6);
  ctx.fillRect(5, 11, 5, 6);

  ctx.restore();
}

function drawBackground(camX, camY) {
  const gradient = ctx.createLinearGradient(0, 0, 0, screenH);
  gradient.addColorStop(0, "#7cc9ff");
  gradient.addColorStop(1, "#d5f4ff");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, screenW, screenH);

  ctx.save();
  ctx.translate(-camX * 0.18, -camY * 0.08);

  ctx.fillStyle = "rgba(255,255,255,0.75)";
  for (let i = 0; i < 16; i++) {
    const x = i * 420 + 80;
    const y = 70 + Math.sin(i * 2.1) * 35;

    ctx.beginPath();
    ctx.arc(x, y, 28, 0, Math.PI * 2);
    ctx.arc(x + 26, y - 8, 34, 0, Math.PI * 2);
    ctx.arc(x + 60, y, 26, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function draw() {
  let camX = player.x + player.w / 2 - screenW / 2;
  let camY = player.y + player.h / 2 - screenH * 0.45;

  camX = Math.max(0, Math.min(camX, MAP_W * TILE - screenW));
  camY = Math.max(0, Math.min(camY, MAP_H * TILE - screenH));

  drawBackground(camX, camY);

  ctx.save();
  ctx.translate(-camX, -camY);

  const startX = Math.max(0, Math.floor(camX / TILE) - 1);
  const endX = Math.min(MAP_W - 1, Math.floor((camX + screenW) / TILE) + 1);
  const startY = Math.max(0, Math.floor(camY / TILE) - 1);
  const endY = Math.min(MAP_H - 1, Math.floor((camY + screenH) / TILE) + 1);

  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      const tile = getTile(x, y);

      if (tile !== AIR) {
        drawBlock(x, y, tile);
      }
    }
  }

  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life * 2);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
    ctx.globalAlpha = 1;
  }

  drawCat();

  ctx.restore();
}

let lastTime = performance.now();

function loop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  update(dt);
  draw();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
