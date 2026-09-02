let timeOffset = 0;
let currentPhase = null;

self.onmessage = function(e) {
  if (e.data.type === 'START') {
    timeOffset = e.data.timeOffset;
    // 初回チェック
    checkPhase();
    // 500ms間隔でチェックを継続
    setInterval(checkPhase, 500);
  }
};

function checkPhase() {
  const currentUtcTime = Date.now() + timeOffset;
  const jstTime = currentUtcTime + (9 * 60 * 60 * 1000); // UTC to JST
  const jstDate = new Date(jstTime);
  const minutes = jstDate.getUTCMinutes();
  
  let phase = '';
  if (minutes >= 0 && minutes < 5) {
    phase = 'break';
  } else if (minutes >= 5 && minutes < 30) {
    phase = 'work';
  } else if (minutes >= 30 && minutes < 35) {
    phase = 'break';
  } else if (minutes >= 35 && minutes < 60) {
    phase = 'work';
  }
  
  if (currentPhase !== phase) {
    currentPhase = phase;
    self.postMessage({ type: 'PHASE_CHANGE', phase: phase });
  }
}
