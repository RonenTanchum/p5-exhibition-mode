import { createExhibitionMode } from "../src/index.js";

const exhibition = createExhibitionMode({
  title: "Field Study",
  artist: "Phenomena Labs",
  seed: 1842,
  maxPixelRatio: 1.5,
  idleReset: false
});

let particles = [];

window.setup = function setup() {
  exhibition.setup();
  exhibition.applyPixelRatio();
  createCanvas(windowWidth, windowHeight);
  noiseSeed(1842);
  randomSeed(1842);
  particles = Array.from({ length: 420 }, () => ({
    x: random(width),
    y: random(height),
    r: random(0.4, 2.8),
    a: random(TAU),
    s: random(0.18, 0.9)
  }));
};

window.draw = function draw() {
  exhibition.tick();
  background(5, 5, 5, 22);
  blendMode(ADD);
  noStroke();

  const t = millis() * 0.00008;
  for (const p of particles) {
    const field = noise(p.x * 0.0018, p.y * 0.0018, t) * TAU * 2;
    p.x += cos(field + p.a) * p.s;
    p.y += sin(field - p.a) * p.s;

    if (p.x < -20) p.x = width + 20;
    if (p.x > width + 20) p.x = -20;
    if (p.y < -20) p.y = height + 20;
    if (p.y > height + 20) p.y = -20;

    const glow = 120 + 90 * sin(t * 18 + p.a);
    fill(120, 170, 255, glow);
    circle(p.x, p.y, p.r);
  }

  blendMode(BLEND);
};

window.windowResized = function windowResized() {
  exhibition.applyPixelRatio();
  resizeCanvas(windowWidth, windowHeight);
};
