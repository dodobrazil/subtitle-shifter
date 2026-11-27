(function () {
  'use strict';
  var S = window.Subtitles;
  var $ = function (id) { return document.getElementById(id); };
  var name = 'subtitles';
  var ext = 'srt';
  var out = '';

  function run() {
    var text = $('input').value;
    out = ''; $('output').value = '';
    if (!text.trim()) { $('status').textContent = 'Load or paste a subtitle file first.'; return; }
    var max = parseInt($('maxChars').value, 10);
    var lines = parseInt($('maxLines').value, 10);
    if (!(max >= 10 && max <= 100)) { $('status').textContent = 'Max characters per line must be between 10 and 100.'; return; }
    var p = S.parse(text);
    ext = p.format === 'vtt' ? 'vtt' : 'srt';
    var r = S.rewrapLines(p.cues, { maxChars: max, maxLines: lines > 0 ? lines : 2 });
    out = S.serialize(r.cues, ext);
    $('output').value = out;
    $('status').textContent = r.cues.length + ' cues, ' + r.changed + ' re-wrapped.' +
      (r.tooLong ? ' ' + r.tooLong + ' cue(s) still have a single word longer than the limit.' : '') +
      (r.tooManyLines ? ' ' + r.tooManyLines + ' cue(s) need more than ' + r.maxLines + ' lines; consider splitting them in time.' : '') +
      (p.errors.length ? ' ' + p.errors.length + ' problem(s) skipped.' : '');
  }

  function save() {
    run();
    if (!out) return;
    var blob = new Blob([out], { type: ext === 'vtt' ? 'text/vtt;charset=utf-8' : 'application/x-subrip;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name + '.wrapped.' + ext;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  $('file').addEventListener('change', function (e) {
    var f = e.target.files[0];
    if (!f) return;
    name = f.name.replace(/\.[^.]+$/, '') || 'subtitles';
    var fr = new FileReader();
    fr.onload = function () { $('input').value = S.decodeBytes(new Uint8Array(fr.result), $('encoding').value).text; run(); };
    fr.readAsArrayBuffer(f);
  });
  $('apply').addEventListener('click', run);
  $('dl').addEventListener('click', save);
  S.ENCODINGS.forEach(function (e) {
    var o = document.createElement('option');
    o.value = e[0]; o.textContent = e[1];
    $('encoding').appendChild(o);
  });
})();
