/* Subtitle toolkit: pure logic, no DOM. Works in browser (window.Subtitles) and Node (module.exports). */
(function (root) {
  'use strict';

  var TS = '(?:(\\d+):)?(\\d{1,2}):(\\d{2})[,.](\\d{1,3})';
  var CUE_LINE = new RegExp('^\\s*' + TS + '\\s*-->\\s*' + TS + '(.*)$');

  function normalize(text) {
    text = String(text == null ? '' : text);
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    return text.replace(/\r\n?/g, '\n');
  }

  function toMs(h, m, s, f) {
    var frac = (f + '00').slice(0, 3);
    return (Number(h || 0) * 3600 + Number(m) * 60 + Number(s)) * 1000 + Number(frac);
  }

  function pad(n, w) {
    n = String(n);
    while (n.length < w) n = '0' + n;
    return n;
  }

  function formatTime(ms, sep) {
    ms = Math.max(0, Math.round(ms));
    var h = Math.floor(ms / 3600000);
    var m = Math.floor((ms % 3600000) / 60000);
    var s = Math.floor((ms % 60000) / 1000);
    return pad(h, 2) + ':' + pad(m, 2) + ':' + pad(s, 2) + (sep || ',') + pad(ms % 1000, 3);
  }

  function detectFormat(text) {
    var t = normalize(text).replace(/^\s+/, '');
    if (/^WEBVTT/.test(t)) return 'vtt';
    if (/^\[Script Info\]/i.test(t) || /^\[Events\]/im.test(t)) return 'ass';
    return 'srt';
  }

  // Turn ASS {\i1} {\b1} override tags into <i>/<b>, nested correctly; \r resets; unclosed tags are closed at the end of the line.
  function assFormat(body) {
    var stack = [];
    function close(tag) {
      var res = '', keep = [], idx = stack.lastIndexOf(tag);
      if (idx === -1) return '';
      while (stack.length > idx) {
        var t = stack.pop();
        res += '</' + t + '>';
        if (t !== tag) keep.push(t);
      }
      while (keep.length) { var k = keep.pop(); stack.push(k); res += '<' + k + '>'; }
      return res;
    }
    var out = body.replace(/\{([^}]*)\}/g, function (m, inner) {
      var res = '';
      var re = /\\(?:([ib])([01])(?![0-9])|(r))/g, mm;
      while ((mm = re.exec(inner))) {
        if (mm[3]) { while (stack.length) res += '</' + stack.pop() + '>'; continue; }
        var tag = mm[1];
        if (mm[2] === '1') { if (stack.indexOf(tag) === -1) { stack.push(tag); res += '<' + tag + '>'; } }
        else res += close(tag);
      }
      return res + m;
    });
    while (stack.length) out += '</' + stack.pop() + '>';
    return out;
  }

  /** List ASS styles used by Dialogue lines: [{name, count}] in first-seen order. [] for non-ASS input. */
  function assStyles(input) {
    var text = normalize(input);
    if (detectFormat(text) !== 'ass') return [];
    var cols = null, inEv = false, order = [], counts = {};
    text.split('\n').forEach(function (raw) {
      var line = raw.trim();
      if (/^\[.*\]$/.test(line)) { inEv = /^\[Events\]$/i.test(line); return; }
      if (!inEv) return;
      var fm = /^Format:\s*(.*)$/i.exec(line);
      if (fm) { cols = fm[1].split(',').map(function (c) { return c.trim().toLowerCase(); }); return; }
      var dm = /^Dialogue:\s?(.*)$/i.exec(line);
      if (!dm) return;
      var names = cols || ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text'];
      var si = names.indexOf('style');
      if (si === -1) return;
      var n = dm[1].split(',')[si].trim();
      if (!(n in counts)) { counts[n] = 0; order.push(n); }
      counts[n]++;
    });
    return order.map(function (n) { return { name: n, count: counts[n] }; });
  }

  /** Parse ASS/SSA dialogue lines into cues. Styling tags are dropped, \N becomes a line break. */
  function parseAss(text, opts) {
    opts = opts || {};
    var skip = (opts.skipStyles || []).map(function (x) { return String(x).toLowerCase(); });
    var lines = text.split('\n');
    var cues = [];
    var errors = [];
    var inEvents = false;
    var cols = null;
    var skipped = 0;
    function t(str) {
      var m = /^\s*(\d+):(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?\s*$/.exec(str);
      return m ? toMs(m[1], m[2], m[3], m[4] || '0') : NaN;
    }
    lines.forEach(function (raw, i) {
      var line = raw.trim();
      if (/^\[.*\]$/.test(line)) { inEvents = /^\[Events\]$/i.test(line); return; }
      if (!inEvents) return;
      var fm = /^Format:\s*(.*)$/i.exec(line);
      if (fm) { cols = fm[1].split(',').map(function (c) { return c.trim().toLowerCase(); }); return; }
      var dm = /^Dialogue:\s?(.*)$/i.exec(line);
      if (!dm) return;
      var names = cols || ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text'];
      var parts = dm[1].split(',');
      var ti = names.indexOf('text');
      if (ti === -1) ti = names.length - 1;
      var fields = parts.slice(0, ti);
      fields.push(parts.slice(ti).join(','));
      var start = t(fields[names.indexOf('start')]);
      var end = t(fields[names.indexOf('end')]);
      if (isNaN(start) || isNaN(end)) {
        errors.push({ line: i + 1, message: 'Malformed ASS dialogue timestamps (line skipped)' });
        return;
      }
      var body = fields[ti];
      var si = names.indexOf('style');
      if (si !== -1 && skip.indexOf(String(fields[si]).trim().toLowerCase()) !== -1) return;
      if (/\{[^}]*\\p[1-9]/.test(body)) { skipped++; return; }
      if (opts.keepFormatting) body = assFormat(body);
      body = body.replace(/\{[^}]*\}/g, '').replace(/\\[Nn]/g, '\n').replace(/\\h/g, ' ').trim();
      if (body === '') return;
      if (end < start) errors.push({ line: i + 1, message: 'End time is before start time (cue kept)' });
      cues.push({ start: start, end: end, text: body, settings: '' });
    });
    if (skipped) errors.push({ line: 0, message: skipped + ' drawing-mode ASS line(s) ignored' });
    return { format: 'ass', cues: sortCues(cues), errors: errors };
  }

  /** Parse SRT or WebVTT. Never throws. Returns {format, cues, errors:[{line,message}]}. */
  function parse(input, opts) {
    var text = normalize(input);
    var format = detectFormat(text);
    if (format === 'ass') return parseAss(text, opts);
    var lines = text.split('\n');
    var cues = [];
    var errors = [];
    var blocks = [];
    var cur = null;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '') {
        cur = null;
      } else {
        if (!cur) { cur = []; blocks.push(cur); }
        cur.push({ n: i + 1, s: lines[i] });
      }
    }
    blocks.forEach(function (block, bi) {
      var first = block[0].s;
      if (bi === 0 && format === 'vtt' && /^WEBVTT/.test(first.trim())) return;
      if (format === 'vtt' && /^(NOTE|STYLE|REGION)(\s|$)/.test(first)) return;
      var idx = -1;
      for (var k = 0; k < block.length; k++) {
        if (block[k].s.indexOf('-->') !== -1) { idx = k; break; }
      }
      if (idx === -1) {
        errors.push({ line: block[0].n, message: 'Cue has no timestamp line (' + JSON.stringify(first.slice(0, 40)) + ')' });
        return;
      }
      var tl = block[idx];
      var m = CUE_LINE.exec(tl.s);
      if (!m) {
        errors.push({ line: tl.n, message: 'Malformed timestamp: ' + JSON.stringify(tl.s.trim().slice(0, 60)) });
        return;
      }
      var start = toMs(m[1], m[2], m[3], m[4]);
      var end = toMs(m[5], m[6], m[7], m[8]);
      if (end < start) {
        errors.push({ line: tl.n, message: 'End time is before start time (cue kept)' });
      }
      var textLines = [];
      for (var j = idx + 1; j < block.length; j++) {
        if (block[j].s.indexOf('-->') !== -1 && CUE_LINE.test(block[j].s)) {
          errors.push({ line: block[j].n, message: 'Timestamp inside cue text: blank line missing before it? (kept as text)' });
        }
        textLines.push(block[j].s);
      }
      var settings = (m[9] || '').trim();
      cues.push({
        start: start,
        end: end,
        text: textLines.join('\n'),
        settings: format === 'vtt' ? settings : ''
      });
    });
    return { format: format, cues: cues, errors: errors };
  }

  function serialize(cues, format) {
    var out = [];
    var sep = format === 'vtt' ? '.' : ',';
    if (format === 'vtt') out.push('WEBVTT\n');
    cues.forEach(function (c, i) {
      var head = formatTime(c.start, sep) + ' --> ' + formatTime(c.end, sep);
      if (format === 'vtt' && c.settings) head += ' ' + c.settings;
      var block = (format === 'vtt' ? '' : (i + 1) + '\n') + head + '\n' + c.text;
      out.push(block.replace(/\n+$/, '') + '\n');
    });
    return out.join('\n');
  }

  function clone(cues) {
    return cues.map(function (c) { return { start: c.start, end: c.end, text: c.text, settings: c.settings || '' }; });
  }

  function sortCues(cues) {
    return clone(cues)
      .map(function (c, i) { return { c: c, i: i }; })
      .sort(function (a, b) { return a.c.start - b.c.start || a.i - b.i; })
      .map(function (x) { return x.c; });
  }

  /** Shift all cues by ms (may be negative). Times clamp at 0; cues ending at or before 0 are dropped. */
  function shift(cues, ms) {
    var dropped = 0;
    var out = [];
    clone(cues).forEach(function (c) {
      c.start += ms;
      c.end += ms;
      if (c.end <= 0) { dropped++; return; }
      if (c.start < 0) c.start = 0;
      out.push(c);
    });
    return { cues: out, dropped: dropped };
  }

  /** Multiply all times by factor. */
  function scale(cues, factor) {
    if (!(factor > 0) || !isFinite(factor)) throw new RangeError('Scale factor must be a positive number');
    return clone(cues).map(function (c) {
      c.start = Math.round(c.start * factor);
      c.end = Math.round(c.end * factor);
      return c;
    });
  }

  /** Subtitles timed for fromFps but video is toFps: new = old * fromFps / toFps. */
  function scaleFps(cues, fromFps, toFps) {
    if (!(fromFps > 0) || !(toFps > 0)) throw new RangeError('Frame rates must be positive numbers');
    return scale(cues, fromFps / toFps);
  }

  /** Common frame rates. 23.976 and 29.97 are the exact NTSC fractions (24000/1001, 30000/1001). */
  var FRAME_RATES = { '23.976': 24000 / 1001, '24': 24, '25': 25, '29.97': 30000 / 1001, '30': 30 };

  /** Rate from a preset key ("23.976") or any positive number/string. NaN if invalid. */
  function resolveFps(v) {
    var k = String(v).trim();
    if (Object.prototype.hasOwnProperty.call(FRAME_RATES, k)) return FRAME_RATES[k];
    var n = Number(k);
    return n > 0 && isFinite(n) ? n : NaN;
  }

  /** Retime subtitles authored for a video at `from` fps so they match a copy at `to` fps. Returns {cues, factor}. */
  function convertFramerate(cues, from, to) {
    var f = resolveFps(from), t = resolveFps(to);
    if (isNaN(f) || isNaN(t)) throw new RangeError('Frame rates must be positive numbers');
    return { cues: scaleFps(cues, f, t), factor: f / t };
  }

  /** Parse "HH:MM:SS,mmm", "MM:SS.m" or plain seconds ("62.5") into ms. NaN if invalid. */
  function parseTimeInput(str) {
    str = String(str == null ? '' : str).trim();
    var m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?$/.exec(str);
    if (m) return toMs(m[1], m[2], m[3], m[4] || '0');
    if (/^\d+(\.\d+)?$/.test(str)) return Math.round(parseFloat(str) * 1000);
    return NaN;
  }

  /**
   * Two-point linear sync: a subtitle at time a1 should be at b1, and the one at a2 at b2.
   * new = b1 + (t - a1) * (b2 - b1) / (a2 - a1). Fixes constant offset plus drift in one step.
   */
  function linearSync(cues, a1, b1, a2, b2) {
    [a1, b1, a2, b2].forEach(function (v) {
      if (typeof v !== 'number' || !isFinite(v)) throw new RangeError('Reference times must be valid numbers');
    });
    if (a1 === a2) throw new RangeError('The two "current" times must be different');
    var factor = (b2 - b1) / (a2 - a1);
    if (!(factor > 0)) throw new RangeError('The two "correct" times must be in the same order as the current ones');
    var dropped = 0;
    var out = [];
    clone(cues).forEach(function (c) {
      c.start = Math.round(b1 + (c.start - a1) * factor);
      c.end = Math.round(b1 + (c.end - a1) * factor);
      if (c.end <= 0) { dropped++; return; }
      if (c.start < 0) c.start = 0;
      out.push(c);
    });
    return { cues: out, dropped: dropped, factor: factor, offset: b1 - a1 * factor };
  }

  /** Sort by start and trim each cue's end so it does not run into the next cue. */
  function fixOverlaps(cues, gapMs) {
    gapMs = gapMs > 0 ? gapMs : 0;
    var sorted = sortCues(cues);
    var fixed = 0;
    for (var i = 0; i < sorted.length - 1; i++) {
      var c = sorted[i];
      var limit = sorted[i + 1].start - gapMs;
      if (c.end > limit) {
        c.end = Math.max(c.start + 1, limit);
        fixed++;
      }
    }
    return { cues: sorted, fixed: fixed };
  }

  function visibleText(text) {
    return String(text).replace(/<[^>]*>/g, '').replace(/\{\\[^}]*\}/g, '');
  }

  /** Flag lines longer than maxChars and cues reading faster than maxCps. */
  function analyze(cues, opts) {
    opts = opts || {};
    var maxChars = opts.maxChars > 0 ? opts.maxChars : 42;
    var maxCps = opts.maxCps > 0 ? opts.maxCps : 21;
    var issues = [];
    cues.forEach(function (c, i) {
      var lines = visibleText(c.text).split('\n');
      lines.forEach(function (l, li) {
        if (l.length > maxChars) {
          issues.push({ index: i + 1, start: c.start, type: 'line', value: l.length, limit: maxChars,
            message: 'Line ' + (li + 1) + ' has ' + l.length + ' chars (max ' + maxChars + ')' });
        }
      });
      var chars = lines.join('').length;
      var dur = (c.end - c.start) / 1000;
      if (chars > 0) {
        var cps = dur > 0 ? chars / dur : Infinity;
        if (cps > maxCps) {
          issues.push({ index: i + 1, start: c.start, type: 'cps', value: cps, limit: maxCps,
            message: (isFinite(cps) ? cps.toFixed(1) : 'infinite') + ' chars/sec (max ' + maxCps + ')' });
        }
      }
    });
    return issues;
  }

  /** Append b after a (optionally offsetting b by offsetMs) and sort. */
  function merge(a, b, offsetMs) {
    var shifted = clone(b).map(function (c) {
      c.start += offsetMs || 0;
      c.end += offsetMs || 0;
      return c;
    });
    return sortCues(clone(a).concat(shifted));
  }

  /**
   * Combine two subtitle tracks (e.g. two languages) into one, stacking text.
   * Each cue of b is attached to the cue of a it overlaps most (a keeps its timing).
   * opts: offsetMs (shift b first), minOverlapMs (default 1), keepUnmatched (default true: b cues with no
   * partner stay as their own cues), order 'a-first'|'b-first'.
   */
  function mergeDual(a, b, opts) {
    opts = opts || {};
    var off = opts.offsetMs || 0;
    var minOv = opts.minOverlapMs == null ? 1 : opts.minOverlapMs;
    var keep = opts.keepUnmatched !== false;
    var bFirst = opts.order === 'b-first';
    var A = sortCues(a);
    var B = sortCues(b).map(function (c) { c.start += off; c.end += off; return c; });
    var groups = A.map(function () { return []; });
    var leftover = [];
    B.forEach(function (bc) {
      var best = -1, bestOv = 0;
      A.forEach(function (ac, i) {
        var ov = Math.min(ac.end, bc.end) - Math.max(ac.start, bc.start);
        if (ov >= minOv && ov > bestOv) { best = i; bestOv = ov; }
      });
      if (best < 0) leftover.push(bc); else groups[best].push(bc);
    });
    var matched = 0;
    var out = A.map(function (ac, i) {
      var parts = groups[i].map(function (c) { return c.text; });
      matched += parts.length;
      ac.text = (bFirst ? parts.concat([ac.text]) : [ac.text].concat(parts)).join('\n');
      return ac;
    });
    if (keep) out = out.concat(leftover);
    return { cues: sortCues(out), matched: matched, unmatched: leftover.length };
  }

  var ENCODINGS = [
    ['utf-8', 'UTF-8'], ['utf-16le', 'UTF-16 LE'], ['utf-16be', 'UTF-16 BE'],
    ['windows-1252', 'Western European (windows-1252)'], ['windows-1250', 'Central European (windows-1250)'],
    ['windows-1251', 'Cyrillic (windows-1251)'], ['windows-1253', 'Greek (windows-1253)'],
    ['windows-1254', 'Turkish (windows-1254 / ISO-8859-9)'], ['windows-1255', 'Hebrew (windows-1255)'],
    ['windows-1256', 'Arabic (windows-1256)'], ['windows-1257', 'Baltic (windows-1257)'],
    ['koi8-r', 'Cyrillic (KOI8-R)'], ['shift_jis', 'Japanese (Shift_JIS)'], ['gbk', 'Chinese (GBK)'],
    ['big5', 'Chinese (Big5)'], ['euc-kr', 'Korean (EUC-KR)']
  ];

  /* Guess encoding from raw bytes: BOMs first, then BOM-less UTF-16 (zero-byte pattern), then strict UTF-8, else windows-1252. */
  function detectEncoding(buf) {
    var b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) return 'utf-8';
    if (b.length >= 2 && b[0] === 0xFF && b[1] === 0xFE) return 'utf-16le';
    if (b.length >= 2 && b[0] === 0xFE && b[1] === 0xFF) return 'utf-16be';
    var n = Math.min(b.length, 4096), even = 0, odd = 0;
    for (var i = 0; i < n; i++) if (b[i] === 0) { if (i % 2) odd++; else even++; }
    var pairs = Math.floor(n / 2);
    if (pairs >= 4) {
      if (odd > pairs * 0.3 && even < pairs * 0.05) return 'utf-16le';
      if (even > pairs * 0.3 && odd < pairs * 0.05) return 'utf-16be';
    }
    try { new TextDecoder('utf-8', { fatal: true }).decode(b); return 'utf-8'; } catch (e) { return 'windows-1252'; }
  }

  /* Decode bytes. encoding omitted/'auto' = detect. Returns { text, encoding }. */
  function decodeBytes(buf, encoding) {
    var b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    var enc = !encoding || encoding === 'auto' ? detectEncoding(b) : String(encoding).toLowerCase();
    return { text: new TextDecoder(enc).decode(b), encoding: enc };
  }

  // Convert subtitle text to 'srt' or 'vtt'. target omitted = opposite of the detected format (ASS -> srt).
  function convert(text, target, opts) {
    var r = parse(text, opts);
    var from = r.format;
    var to = target || (from === 'srt' ? 'vtt' : 'srt');
    if (to !== 'srt' && to !== 'vtt') throw new RangeError('target must be srt or vtt');
    return { text: serialize(r.cues, to), from: from, to: to, count: r.cues.length, errors: r.errors };
  }

  /**
   * Remove hearing-impaired (SDH) annotations: [door slams], (laughs), JOHN: speaker labels, music lines.
   * opts: brackets, parens, speakers, music (all default true). Cues left empty are dropped.
   */
  function stripSdh(cues, opts) {
    opts = opts || {};
    var on = function (k) { return opts[k] !== false; };
    var removed = 0;
    var out = [];
    clone(cues).forEach(function (c) {
      var t = c.text;
      if (on('brackets')) t = t.replace(/\[[^\]]{0,120}\]/g, '');
      if (on('parens')) t = t.replace(/\([^)]{0,120}\)/g, '');
      var lines = t.split('\n').map(function (l) {
        if (on('music') && /[\u266a\u266b]/.test(l)) return '';
        if (on('speakers')) l = l.replace(/^(\s*(?:-\s*)?)[A-Z][A-Z0-9 .'#-]{1,24}:\s+/, '$1');
        return l.replace(/\s{2,}/g, ' ').trim();
      }).filter(function (l) { return l !== '' && !/^-+$/.test(l); });
      if (lines.length === 1) lines[0] = lines[0].replace(/^-\s*/, '');
      if (!lines.length) { removed++; return; }
      c.text = lines.join('\n');
      out.push(c);
    });
    return { cues: out, removed: removed };
  }

  /**
   * Extract plain text (transcript) from cues. opts: mode 'lines' (one line per cue, default) or 'paragraphs'
   * (cues joined, new paragraph after a gap longer than gapMs, default 2000); timestamps (prefix [hh:mm:ss] in lines mode);
   * stripTags (default true: <i>, <c.x>, {\an8}); dedupe (default true: drop a cue identical to the previous one).
   */
  function toText(cues, opts) {
    opts = opts || {};
    var gap = opts.gapMs == null ? 2000 : opts.gapMs;
    var tags = opts.stripTags !== false;
    var dedupe = opts.dedupe !== false;
    var items = [];
    var prev = null;
    sortCues(cues).forEach(function (c) {
      var t = String(c.text);
      if (tags) t = visibleText(t);
      t = t.split('\n').map(function (l) { return l.replace(/\s+/g, ' ').trim(); }).filter(Boolean).join(' ');
      if (!t) return;
      if (dedupe && t === prev) return;
      prev = t;
      items.push({ start: c.start, end: c.end, text: t });
    });
    var out;
    if (opts.mode === 'paragraphs') {
      var paras = [];
      var last = null;
      items.forEach(function (it) {
        if (last !== null && it.start - last <= gap) paras[paras.length - 1] += ' ' + it.text;
        else paras.push(it.text);
        last = it.end;
      });
      out = paras.join('\n\n');
    } else {
      out = items.map(function (it) {
        return (opts.timestamps ? '[' + formatTime(it.start, ',').slice(0, 8) + '] ' : '') + it.text;
      }).join('\n');
    }
    return { text: out ? out + '\n' : '', count: items.length };
  }

  /**
   * Split cues at a time. Cues starting before splitMs go to `first` (an end past the split is clipped to it);
   * the rest go to `second`. opts.rebase (default true) moves `second` so the split point becomes 00:00:00.
   */
  function splitAt(cues, splitMs, opts) {
    if (typeof splitMs !== 'number' || !isFinite(splitMs) || splitMs <= 0) throw new RangeError('Split time must be greater than zero');
    var rebase = !opts || opts.rebase !== false;
    var first = [], second = [], clipped = 0;
    clone(sortCues(cues)).forEach(function (c) {
      if (c.start < splitMs) {
        if (c.end > splitMs) { c.end = splitMs; clipped++; }
        first.push(c);
      } else {
        if (rebase) { c.start -= splitMs; c.end -= splitMs; }
        second.push(c);
      }
    });
    return { first: first, second: second, clipped: clipped };
  }

  /**
   * Reading-speed / line-length / duration check. Pure function.
   * limits: {cps:17, cpl:42, minMs:833, maxMs:7000, maxLines:0 (0 = off)}.
   * Characters = visible characters (HTML-like tags and ASS braces removed, line breaks not counted, spaces counted).
   * Returns {rows:[{index,start,end,durationMs,chars,cps,maxLineLen,lines,issues:[codes],text}], violations, total, limits}.
   * Issue codes: cps, cpl, short, long, lines.
   */
  function analyzeReadingSpeed(cues, limits) {
    var L = { cps: 17, cpl: 42, minMs: 833, maxMs: 7000, maxLines: 0 };
    if (limits) Object.keys(L).forEach(function (k) { if (typeof limits[k] === 'number' && isFinite(limits[k]) && limits[k] >= 0) L[k] = limits[k]; });
    var rows = [], violations = 0;
    sortCues(cues || []).forEach(function (c, i) {
      var visible = String(c.text || '').replace(/<[^>]*>/g, '').replace(/\{[^}]*\}/g, '');
      var lines = visible.split('\n').map(function (l) { return l.replace(/^\s+|\s+$/g, ''); }).filter(function (l) { return l.length; });
      var chars = lines.join('').length;
      var dur = c.end - c.start;
      var cps = dur > 0 ? chars / (dur / 1000) : (chars ? Infinity : 0);
      var maxLen = 0;
      lines.forEach(function (l) { if (l.length > maxLen) maxLen = l.length; });
      var issues = [];
      if (L.cps > 0 && cps > L.cps) issues.push('cps');
      if (L.cpl > 0 && maxLen > L.cpl) issues.push('cpl');
      if (L.minMs > 0 && dur < L.minMs) issues.push('short');
      if (L.maxMs > 0 && dur > L.maxMs) issues.push('long');
      if (L.maxLines > 0 && lines.length > L.maxLines) issues.push('lines');
      if (issues.length) violations++;
      rows.push({ index: i + 1, start: c.start, end: c.end, durationMs: dur, chars: chars, cps: Math.round(cps * 10) / 10, maxLineLen: maxLen, lines: lines.length, issues: issues, text: lines.join(' / ') });
    });
    return { rows: rows, violations: violations, total: rows.length, limits: L };
  }

  /* Re-wrap cue text to a maximum line length, balanced across lines. Tags are not counted. */
  function visLen(w) { return w.replace(/<[^>]*>|\{[^}]*\}/g, '').length; }
  function wrapWords(words, width) {
    var lines = [], cur = [], len = 0;
    words.forEach(function (w) {
      var l = visLen(w);
      if (cur.length && len + 1 + l > width) { lines.push(cur.join(' ')); cur = [w]; len = l; }
      else { len = cur.length ? len + 1 + l : l; cur.push(w); }
    });
    if (cur.length) lines.push(cur.join(' '));
    return lines;
  }
  function wrapBalanced(words, max) {
    var k = wrapWords(words, max).length;
    if (k <= 1) return wrapWords(words, max);
    var total = words.reduce(function (a, w) { return a + visLen(w); }, 0) + words.length - 1;
    for (var w = Math.ceil(total / k); w < max; w++) {
      var r = wrapWords(words, w);
      if (r.length <= k) return r;
    }
    return wrapWords(words, max);
  }
  function rewrapLines(cues, opts) {
    var o = opts || {};
    var max = o.maxChars > 0 ? Math.floor(o.maxChars) : 42;
    var maxLines = o.maxLines > 0 ? Math.floor(o.maxLines) : 2;
    var changed = 0, tooLong = 0, tooManyLines = 0;
    var out = cues.map(function (c) {
      var raw = String(c.text).replace(/\r/g, '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      var dialogue = raw.length > 1 && raw.every(function (l) { return /^[-–—]/.test(l); });
      var groups = dialogue ? raw : [raw.join(' ')];
      var lines = [];
      groups.forEach(function (g) {
        var words = g.match(/(?:<[^>]*>|\{[^}]*\}|[^\s<{])+/g) || [];
        lines = lines.concat(words.length ? wrapBalanced(words, max) : []);
      });
      var text = lines.join('\n');
      if (text !== c.text) changed++;
      if (lines.some(function (l) { return visLen(l) > max; })) tooLong++;
      if (lines.length > maxLines) tooManyLines++;
      var nc = {}; Object.keys(c).forEach(function (k) { nc[k] = c[k]; }); nc.text = text;
      return nc;
    });
    return { cues: out, changed: changed, tooLong: tooLong, tooManyLines: tooManyLines, maxChars: max, maxLines: maxLines };
  }

  var api = {
    rewrapLines: rewrapLines,
    analyzeReadingSpeed: analyzeReadingSpeed,
    splitAt: splitAt,
    toText: toText,
    stripSdh: stripSdh,
    convert: convert, assStyles: assStyles,
    detectEncoding: detectEncoding, decodeBytes: decodeBytes, ENCODINGS: ENCODINGS,
    normalize: normalize, detectFormat: detectFormat, parse: parse, serialize: serialize,
    formatTime: formatTime, shift: shift, scale: scale, scaleFps: scaleFps, convertFramerate: convertFramerate, resolveFps: resolveFps, FRAME_RATES: FRAME_RATES,
    fixOverlaps: fixOverlaps, linearSync: linearSync, parseTimeInput: parseTimeInput, analyze: analyze, merge: merge, mergeDual: mergeDual, sortCues: sortCues
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Subtitles = api;
})(typeof self !== 'undefined' ? self : this);
