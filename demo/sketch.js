import { createExhibitionMode } from "../src/index.js";

const exhibition = createExhibitionMode({
  title: "Field Study",
  artist: "Phenomena Labs",
  seed: 1842,
  maxPixelRatio: 1.5,
  idleReset: false,
  playlist: {
    enabled: false,
    intervalValue: 20,
    intervalUnit: "seconds",
    intervalSeconds: 20,
    randomHash: true,
    hashParam: "hash",
    items: [
      "https://art.phenomenalabs.com/ClassicalRevival/index.html",
      "https://art.phenomenalabs.com/Rococo/index.html"
    ]
  }
});

const note = document.getElementById("demo-note");

if (!window.p5) {
  note.textContent = "p5 failed to load. Check the CDN connection or install p5 locally for offline demos.";
} else {
  new window.p5((p) => {
    let particles = [];

    p.setup = function setup() {
      exhibition.setup();
      exhibition.applyPixelRatio(p);
      p.createCanvas(p.windowWidth, p.windowHeight);
      p.noiseSeed(1842);
      p.randomSeed(1842);
      particles = Array.from({ length: 720 }, () => ({
        x: p.random(p.width),
        y: p.random(p.height),
        r: p.random(1.2, 5.2),
        a: p.random(p.TAU),
        s: p.random(0.35, 1.2)
      }));
      note.textContent = "Click once for fullscreen. Shift + G opens the runtime panel.";
    };

    p.draw = function draw() {
      exhibition.tick();
      p.background(4, 5, 7, 34);
      drawAtmosphere(p);
      p.blendMode(p.ADD);
      p.noStroke();

      const t = p.millis() * 0.00008;
      for (const particle of particles) {
        const field = p.noise(particle.x * 0.0016, particle.y * 0.0016, t) * p.TAU * 2;
        particle.x += p.cos(field + particle.a) * particle.s;
        particle.y += p.sin(field - particle.a) * particle.s;

        if (particle.x < -30) particle.x = p.width + 30;
        if (particle.x > p.width + 30) particle.x = -30;
        if (particle.y < -30) particle.y = p.height + 30;
        if (particle.y > p.height + 30) particle.y = -30;

        const glow = 120 + 120 * p.sin(t * 20 + particle.a);
        p.fill(85, 155, 255, glow);
        p.circle(particle.x, particle.y, particle.r);
      }

      p.blendMode(p.BLEND);
    };

    p.windowResized = function windowResized() {
      exhibition.applyPixelRatio(p);
      p.resizeCanvas(p.windowWidth, p.windowHeight);
    };

    window.addEventListener("p5em:refresh", () => {
      exhibition.applyPixelRatio(p);
      p.resizeCanvas(p.windowWidth, p.windowHeight);
      p.clear();
      p.background(4, 5, 7);
    });
  });
}

function drawAtmosphere(p) {
  p.push();
  p.noStroke();
  for (let i = 0; i < 6; i += 1) {
    const x = p.width * (0.25 + i * 0.11) + p.sin(p.frameCount * 0.006 + i) * 80;
    const y = p.height * (0.42 + p.sin(i * 1.7) * 0.16);
    const size = p.min(p.width, p.height) * (0.34 + i * 0.045);
    p.fill(30, 72, 150, 14);
    p.circle(x, y, size);
  }
  p.fill(180, 220, 255, 36);
  p.circle(p.width * 0.5, p.height * 0.48, p.min(p.width, p.height) * 0.22);
  p.pop();
}
