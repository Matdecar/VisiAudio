/**
 * Cover art extraction and dominant-color analysis.
 * Gracefully degrades when jsmediatags is unavailable or the file has no picture tag.
 */

function extractCoverFromFile(file) {
  return new Promise((resolve) => {
    if (typeof jsmediatags === 'undefined') {
      resolve(null);
      return;
    }
    jsmediatags.read(file, {
      onSuccess({ tags }) {
        const pic = tags.picture;
        if (!pic) { resolve(null); return; }
        try {
          const blob = new Blob([new Uint8Array(pic.data)], { type: pic.format });
          const url  = URL.createObjectURL(blob);
          const img  = new Image();
          img.onload  = () => resolve({ img, url });
          img.onerror = () => resolve(null);
          img.src = url;
        } catch {
          resolve(null);
        }
      },
      onError() { resolve(null); },
    });
  });
}

async function extractCoverFromUrl(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve({ img, url });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Returns an array of `count` dominant colors as "rgb(r,g,b)" strings,
 * sorted darkest → brightest.
 */
function extractColorsFromImage(img, count = 4) {
  const SIZE = 20;
  const cv   = document.createElement('canvas');
  cv.width   = SIZE;
  cv.height  = SIZE;
  const ctx  = cv.getContext('2d');
  ctx.drawImage(img, 0, 0, SIZE, SIZE);

  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
  const pixels = [];

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 64) {
      pixels.push([data[i], data[i + 1], data[i + 2]]);
    }
  }

  if (pixels.length === 0) return defaultPalette();

  const centroids = _kMeans(pixels, count, 15);
  // Sort darkest → brightest so the palette has a natural gradient feel
  centroids.sort((a, b) => _luma(a) - _luma(b));
  return centroids.map(([r, g, b]) => `rgb(${r},${g},${b})`);
}

function defaultPalette() {
  return [
    'rgb(15,15,35)',
    'rgb(90,20,160)',
    'rgb(0,160,210)',
    'rgb(210,70,110)',
  ];
}

// ── internal helpers ───────────────────────────────────────────────────────────

function _kMeans(pixels, k, iterations) {
  const step = Math.max(1, Math.floor(pixels.length / k));
  let centroids = Array.from({ length: k }, (_, i) => [...pixels[(i * step) % pixels.length]]);

  for (let iter = 0; iter < iterations; iter++) {
    const sums   = Array.from({ length: k }, () => [0, 0, 0]);
    const counts = new Array(k).fill(0);

    for (const px of pixels) {
      let minD = Infinity, nearest = 0;
      for (let c = 0; c < k; c++) {
        const d = _dist2(px, centroids[c]);
        if (d < minD) { minD = d; nearest = c; }
      }
      sums[nearest][0] += px[0];
      sums[nearest][1] += px[1];
      sums[nearest][2] += px[2];
      counts[nearest]++;
    }

    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        centroids[c] = sums[c].map(s => Math.round(s / counts[c]));
      }
    }
  }

  return centroids;
}

function _dist2([r1, g1, b1], [r2, g2, b2]) {
  return (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2;
}

function _luma([r, g, b]) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
