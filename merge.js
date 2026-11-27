(function () {
  'use strict';
  var S = window.Subtitles;
  var $ = function (id) { return document.getElementById(id); };
  var name = 'merged';
  var ext = 'srt';

  function run() {
    var ta = $('inputA').value, tb = $('inputB').value;
    if (!ta.trim() || !tb.trim()) { $('status').textContent = 'Provide both subtitle files (A and B).'; $('output').value = ''; return; }
    var pa = S.parse(ta), pb = S.parse(tb);
    var raw = String($('offset').value || '0').trim();
    var off = /^-?\d+(\.\d+)?$/.test(raw) ? Math.round(parseFloat(raw) * 1000) : NaN;
    if (isNaN(off)) { $('status').textContent = 'Offset must be a number of seconds, e.g. 2.5 or -1.5.'; $('output').value = ''; return; }
    var msg;
    if ($('mode').value === 'append') {
      var cues = S.merge(pa.cues, pb.cues, off);
      $('output').value = S.serialize(cues, pa.format === 'vtt' ? 'vtt' : 'srt');
      msg = cues.length + ' cues: file B appended' + (off ? ' with an offset' : '') + '.';
    } else {
      var r = S.mergeDual(pa.cues, pb.cues, { offsetMs: off, order: $('order').value, keepUnmatched: $('keep').checked });
      $('output').value = S.serialize(r.cues, pa.format === 'vtt' ? 'vtt' : 'srt');
      msg = r.cues.length + ' cues. ' + r.matched + ' lines of B paired with A, ' + r.unmatched + ' B cue(s) had no overlapping partner' + ($('keep').checked ? ' and were kept on their own.' : ' and were dropped.');
    }
    ext = pa.format === 'vtt' ? 'vtt' : 'srt';
    var bad = pa.errors.length + pb.errors.length;
    $('status').textContent = msg + (bad ? ' ' + bad + ' problem(s) skipped.' : '');
  }

  function loader(fileId, areaId, setName) {
    $(fileId).addEventListener('change', function (e) {
      var f = e.target.files[0];
      if (!f) return;
      if (setName) name = f.name.replace(/\.[^.]+$/, '') || 'merged';
      var fr = new FileReader();
      fr.onload = function () {
        $(areaId).value = S.decodeBytes(new Uint8Array(fr.result), $('encoding').value).text;
        if ($('inputA').value.trim() && $('inputB').value.trim()) run();
      };
      fr.readAsArrayBuffer(f);
    });
  }
  loader('fileA', 'inputA', true);
  loader('fileB', 'inputB', false);

  function syncMode() {
    var dual = $('mode').value === 'dual';
    $('dualOpts').style.display = dual ? '' : 'none';
  }
  $('mode').addEventListener('change', function () { syncMode(); if ($('inputA').value.trim() && $('inputB').value.trim()) run(); });
  $('apply').addEventListener('click', run);
  $('download').addEventListener('click', function () {
    if (!$('output').value) { run(); if (!$('output').value) return; }
    var blob = new Blob([$('output').value], { type: ext === 'vtt' ? 'text/vtt;charset=utf-8' : 'application/x-subrip;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name + '.merged.' + ext;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
  S.ENCODINGS.forEach(function (e) {
    var o = document.createElement('option');
    o.value = e[0]; o.textContent = e[1];
    $('encoding').appendChild(o);
  });
  syncMode();
})();
