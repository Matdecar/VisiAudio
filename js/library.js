/**
 * Built-in track library.
 *
 * To add a track:
 *   1. Place the audio file in  assets/audio/<filename>.mp3
 *   2. Place the cover image in assets/covers/<filename>.jpg  (optional)
 *   3. Add an entry to LIBRARY below.
 *
 * Attribution field is required when the licence demands it (e.g. CC BY).
 */
const LIBRARY = [
  {
    id:          'achaidh-cheide',
    title:       'Achaidh Cheide',
    artist:      'Kevin MacLeod',
    genre:       'Celtic / Folk',
    audio:       'assets/audio/achaidh-cheide.mp3',
    cover:       'assets/covers/achaidh-cheide.jpg',
    attribution: 'Achaidh Cheide par Kevin MacLeod — incompetech.com — CC BY 3.0',
  },
  {
    id:          'airport-lounge',
    title:       'Airport Lounge',
    artist:      'Kevin MacLeod',
    genre:       'Smooth Jazz',
    audio:       'assets/audio/airport-lounge.mp3',
    cover:       'assets/covers/airport-lounge.jpg',
    attribution: 'Airport Lounge par Kevin MacLeod — incompetech.com — CC BY 3.0',
  },
  {
    id:          '8bit-dungeon-level',
    title:       '8bit Dungeon Level',
    artist:      'Kevin MacLeod',
    genre:       'Chiptune / Électronique',
    audio:       'assets/audio/8bit-dungeon-level.mp3',
    cover:       'assets/covers/8bit-dungeon-level.jpg',
    attribution: '8bit Dungeon Level par Kevin MacLeod — incompetech.com — CC BY 3.0',
  },
  {
    id:          'americana',
    title:       'Americana',
    artist:      'Kevin MacLeod',
    genre:       'Country / Folk',
    audio:       'assets/audio/americana.mp3',
    cover:       'assets/covers/americana.jpg',
    attribution: 'Americana par Kevin MacLeod — incompetech.com — CC BY 3.0',
  },
  {
    id:          'asian-drums',
    title:       'Asian Drums',
    artist:      'Kevin MacLeod',
    genre:       'Musiques du monde',
    audio:       'assets/audio/asian-drums.mp3',
    cover:       'assets/covers/asian-drums.jpg',
    attribution: 'Asian Drums par Kevin MacLeod — incompetech.com — CC BY 3.0',
  },
  {
    id:          'autumn-day',
    title:       'Autumn Day',
    artist:      'Kevin MacLeod',
    genre:       'Ambient / Nature',
    audio:       'assets/audio/autumn-day.mp3',
    cover:       'assets/covers/autumn-day.jpg',
    attribution: 'Autumn Day par Kevin MacLeod — incompetech.com — CC BY 3.0',
  },
  {
    id:          'avant-jazz',
    title:       'Avant Jazz',
    artist:      'Kevin MacLeod',
    genre:       'Jazz fusion',
    audio:       'assets/audio/avant-jazz.mp3',
    cover:       'assets/covers/avant-jazz.jpg',
    attribution: 'Avant Jazz par Kevin MacLeod — incompetech.com — CC BY 3.0',
  },
  {
    id:          'bicycle',
    title:       'Bicycle',
    artist:      'Kevin MacLeod',
    genre:       'Upbeat / Fun',
    audio:       'assets/audio/bicycle.mp3',
    cover:       'assets/covers/bicycle.jpg',
    attribution: 'Bicycle par Kevin MacLeod — incompetech.com — CC BY 3.0',
  },
  {
    id:          'bathed-in-the-light',
    title:       'Bathed in the Light',
    artist:      'Kevin MacLeod',
    genre:       'Inspirant / Orchestral',
    audio:       'assets/audio/bathed-in-the-light.mp3',
    cover:       'assets/covers/bathed-in-the-light.jpg',
    attribution: 'Bathed in the Light par Kevin MacLeod — incompetech.com — CC BY 3.0',
  },
];

/**
 * Fetches the audio file (and optional cover) for a library entry.
 * Returns { arrayBuffer, coverImg } where coverImg may be null.
 */
async function loadLibraryTrack(entry) {
  const resp = await fetch(entry.audio);
  if (!resp.ok) throw new Error(`Cannot fetch ${entry.audio} (${resp.status})`);
  const arrayBuffer = await resp.arrayBuffer();

  let coverImg = null;
  if (entry.cover) {
    try {
      const cr = await fetch(entry.cover);
      if (cr.ok) {
        const blob = await cr.blob();
        const url  = URL.createObjectURL(blob);
        coverImg   = await new Promise((resolve) => {
          const img = new Image();
          img.onload  = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = url;
        });
      }
    } catch { /* cover is optional */ }
  }

  return { arrayBuffer, coverImg };
}

/**
 * Populates a <select> element with library entries.
 * Adds a disabled placeholder when the library is empty.
 */
function populateLibrarySelect(selectEl) {
  if (LIBRARY.length === 0) {
    const opt    = document.createElement('option');
    opt.value    = '';
    opt.disabled = true;
    opt.textContent = '(bibliothèque vide — voir assets/audio/)';
    selectEl.appendChild(opt);
    return;
  }

  for (const entry of LIBRARY) {
    const opt       = document.createElement('option');
    opt.value       = entry.id;
    opt.textContent = entry.genre
      ? `${entry.title} · ${entry.genre}`
      : `${entry.artist} — ${entry.title}`;
    selectEl.appendChild(opt);
  }
}
