// Audio tracks lists (opus files)
const audioTracks = {
  work: ['./music/work/Dall_Tube_Heaven.opus'],
  break: ['./music/break/Mysterious_forest.opus']
};

let workVolume = 0.2;
let breakVolume = 0.2;

let timeOffset = 0; // ms offset from local Date.now() to real UTC time
let currentPhase = null; // 'work' or 'break'
let isJoined = false;

// DOM Elements
const bgGradient = document.getElementById('bg-gradient');
const joinOverlay = document.getElementById('join-overlay');
const joinBtn = document.getElementById('join-btn');
const appContainer = document.getElementById('app');
const timeText = document.getElementById('time-text');
const phaseText = document.getElementById('phase-text');
const playingInfo = document.getElementById('playing-info');
const circle = document.querySelector('.progress-ring__circle');
const creditsBtn = document.getElementById('credits-btn');
const creditsModal = document.getElementById('credits-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const adjustBtn = document.getElementById('adjust-btn');
const adjustMenu = document.getElementById('adjust-menu');
const workVolSlider = document.getElementById('work-vol');
const breakVolSlider = document.getElementById('break-vol');

// SVG setup
const radius = circle.r.baseVal.value;
const circumference = radius * 2 * Math.PI;
circle.style.strokeDasharray = `${circumference} ${circumference}`;
circle.style.strokeDashoffset = circumference;

// Audio elements
const audioPlayers = [
  document.getElementById('audio-player-1'),
  document.getElementById('audio-player-2')
];
let activeAudioIndex = 0;
let fadeInterval = null;

// Initialize
async function init() {
  try {
    // キャッシュを無視して、自分自身のURL（GitHub Pages）にHEADリクエストを送る
    const response = await fetch(window.location.href, {
      method: 'HEAD',
      cache: 'no-store'
    });

    // レスポンスヘッダーからサーバーの現在時刻を取得
    const dateHeader = response.headers.get('Date');

    if (!dateHeader) {
      throw new Error("Date header not found");
    }

    // 文字列の時刻（例: "Wed, 02 Sep 2026 15:56:40 GMT"）をミリ秒のUNIXタイムに変換
    const serverTime = new Date(dateHeader).getTime();

    // GitHubサーバーの時刻と、ローカル端末の時計の差分（オフセット）を計算
    timeOffset = serverTime - Date.now();

    document.querySelector('#join-overlay p').textContent = "時刻が同期されました。";
    joinBtn.disabled = false;
  } catch (error) {
    console.error('Failed to sync time:', error);
    document.querySelector('#join-overlay p').textContent = "時刻同期に失敗しました。ローカル時刻を使用します。";
    joinBtn.disabled = false;
  }
}

let worker;

function startApp() {
  isJoined = true;
  joinOverlay.style.opacity = '0';

  // Initialize audio elements (trick to unlock autoplay) MUST happen synchronously on user click
  audioPlayers[0].src = 'data:audio/mp3;base64,';
  audioPlayers[0].load();
  audioPlayers[1].src = 'data:audio/mp3;base64,';
  audioPlayers[1].load();

  // Start Web Worker for background phase monitoring
  worker = new Worker('timer-worker.js');
  worker.onmessage = function (e) {
    if (e.data.type === 'PHASE_CHANGE') {
      currentPhase = e.data.phase;
      handlePhaseChange(currentPhase);
    }
  };
  worker.postMessage({ type: 'START', timeOffset: timeOffset });

  setTimeout(() => {
    joinOverlay.style.display = 'none';
    appContainer.style.display = 'block';
    playingInfo.style.display = 'block';
    // Small delay to allow transition to trigger
    setTimeout(() => {
      appContainer.style.opacity = '1';
    }, 50);

    requestAnimationFrame(updateLoop);
  }, 500);
}

function getJstDate() {
  // Get current real UTC time
  const currentUtcTime = Date.now() + timeOffset;
  // Add 9 hours to get JST time
  const jstTime = currentUtcTime + (9 * 60 * 60 * 1000);
  // Return as Date object so we can use getUTC* methods
  return new Date(jstTime);
}

function getPhaseInfo() {
  const jstDate = getJstDate();
  const minutes = jstDate.getUTCMinutes();
  const seconds = jstDate.getUTCSeconds();
  const milliseconds = jstDate.getUTCMilliseconds();

  let phase = '';
  let phaseEndMinutes = 0;
  let phaseTotalMinutes = 0;

  if (minutes >= 0 && minutes < 5) {
    phase = 'break';
    phaseEndMinutes = 5;
    phaseTotalMinutes = 5;
  } else if (minutes >= 5 && minutes < 30) {
    phase = 'work';
    phaseEndMinutes = 30;
    phaseTotalMinutes = 25;
  } else if (minutes >= 30 && minutes < 35) {
    phase = 'break';
    phaseEndMinutes = 35;
    phaseTotalMinutes = 5;
  } else if (minutes >= 35 && minutes < 60) {
    phase = 'work';
    phaseEndMinutes = 60;
    phaseTotalMinutes = 25;
  }

  const currentTotalSeconds = (minutes * 60) + seconds + (milliseconds / 1000);
  const endTotalSeconds = phaseEndMinutes * 60;
  const remainingSeconds = endTotalSeconds - currentTotalSeconds;

  return {
    phase,
    remainingSeconds,
    phaseTotalSeconds: phaseTotalMinutes * 60
  };
}

function updateLoop() {
  const info = getPhaseInfo();

  // Update UI Text
  const remMin = Math.floor(info.remainingSeconds / 60);
  const remSec = Math.floor(info.remainingSeconds % 60);
  timeText.textContent = `${remMin.toString().padStart(2, '0')}:${remSec.toString().padStart(2, '0')}`;

  // Update SVG Progress
  const progress = info.remainingSeconds / info.phaseTotalSeconds;
  const offset = circumference - (progress * circumference);
  circle.style.strokeDashoffset = offset;

  requestAnimationFrame(updateLoop);
}

function handlePhaseChange(newPhase) {
  // Update Theme
  document.body.className = `${newPhase}-phase`;
  bgGradient.className = `${newPhase}-mode`;
  phaseText.textContent = newPhase.toUpperCase();

  // Play new audio with fade out/in
  playNextAudio(newPhase, true);
}

function getRandomTrack(phase) {
  const tracks = audioTracks[phase];
  if (!tracks || tracks.length === 0) return null;
  const idx = Math.floor(Math.random() * tracks.length);
  return tracks[idx];
}

function playNextAudio(phase, isPhaseChange = true) {
  const nextAudioIndex = activeAudioIndex === 0 ? 1 : 0;
  const currentAudio = audioPlayers[activeAudioIndex];
  const nextAudio = audioPlayers[nextAudioIndex];

  const trackPath = getRandomTrack(phase);
  if (trackPath) {
    nextAudio.src = trackPath;
    const filename = trackPath.split('/').pop();
    playingInfo.textContent = `Playing: ${filename}`;
  }

  nextAudio.onended = () => {
    // When track ends naturally, play another from the SAME phase instantly
    playNextAudio(currentPhase, false);
  };

  if (fadeInterval) clearInterval(fadeInterval);

  if (isPhaseChange && currentAudio && !currentAudio.paused && currentAudio.src) {
    // Fade out current, then fade in next (Time-based to handle background throttling)
    const fadeDuration = 2000;
    const startVolume = currentAudio.volume;
    const fadeOutStartTime = Date.now();

    fadeInterval = setInterval(() => {
      const elapsed = Date.now() - fadeOutStartTime;
      let fraction = elapsed / fadeDuration;
      if (fraction >= 1) fraction = 1;

      currentAudio.volume = Math.max(0, startVolume * (1 - fraction));

      if (fraction >= 1) {
        clearInterval(fadeInterval);
        currentAudio.pause();

        // Start fade in for next audio
        nextAudio.volume = 0;
        nextAudio.play().catch(e => console.log('Audio play error', e));
        activeAudioIndex = nextAudioIndex;

        const targetMaxVolume = phase === 'work' ? workVolume : breakVolume;
        const fadeInStartTime = Date.now();

        fadeInterval = setInterval(() => {
          const inElapsed = Date.now() - fadeInStartTime;
          let inFraction = inElapsed / fadeDuration;
          if (inFraction >= 1) inFraction = 1;

          nextAudio.volume = Math.min(targetMaxVolume, targetMaxVolume * inFraction);

          if (inFraction >= 1) {
            clearInterval(fadeInterval);
          }
        }, 100);
      }
    }, 100);
  } else {
    // Instant switch (natural track end or first play)
    const targetMaxVolume = phase === 'work' ? workVolume : breakVolume;
    if (currentAudio) currentAudio.pause();
    nextAudio.volume = targetMaxVolume;
    nextAudio.play().catch(e => console.log('Audio play error', e));
    activeAudioIndex = nextAudioIndex;
  }
}

// Adjust Menu logic
adjustBtn.addEventListener('click', () => {
  adjustMenu.classList.toggle('open');
});

// Slider values: 50% = 0.2 actual volume. 100% = 0.4 volume.
workVolSlider.addEventListener('input', (e) => {
  workVolume = (e.target.value / 100) * 0.4;
  if (currentPhase === 'work' && !fadeInterval && audioPlayers[activeAudioIndex] && !audioPlayers[activeAudioIndex].paused) {
    audioPlayers[activeAudioIndex].volume = workVolume;
  }
});

breakVolSlider.addEventListener('input', (e) => {
  breakVolume = (e.target.value / 100) * 0.4;
  if (currentPhase === 'break' && !fadeInterval && audioPlayers[activeAudioIndex] && !audioPlayers[activeAudioIndex].paused) {
    audioPlayers[activeAudioIndex].volume = breakVolume;
  }
});

// Modal logic
creditsBtn.addEventListener('click', () => {
  creditsModal.classList.add('active');
});

closeModalBtn.addEventListener('click', () => {
  creditsModal.classList.remove('active');
});

creditsModal.addEventListener('click', (e) => {
  if (e.target === creditsModal) {
    creditsModal.classList.remove('active');
  }
});

joinBtn.addEventListener('click', startApp);

// Run init
init();
