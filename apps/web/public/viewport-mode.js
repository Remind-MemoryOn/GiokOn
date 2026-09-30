// 화면 폭 모드(첫 화면) — src/lib/viewportMode.ts 와 같은 규칙. 규칙을 바꾸면 두 곳을 함께 바꾼다.
// 감독 화면만 반응형(기기 폭), 나머지는 1440 캔버스(휴대폰은 화면에 맞춰 축소).
// React 가 뜨기 전에 정해야 첫 화면이 기기 폭으로 그려졌다가 줄어드는 깜빡임이 없다.
(function () {
  var p = location.pathname;
  var fluid = p === '/caregiver/supervision' || p.indexOf('/caregiver/supervision/') === 0;
  document.documentElement.setAttribute('data-canvas', fluid ? 'fluid' : 'fixed');
  if (fluid) {
    var meta = document.querySelector('meta[name="viewport"]');
    if (meta) meta.setAttribute('content', 'width=device-width, initial-scale=1.0');
  }
})();
