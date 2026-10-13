/*
 * Loaded after the private, authenticated quizScript.
 * The question bank is NOT shipped in this public file.
 * It uses the existing official evaluation functions so practice rules match.
 */
(() => {
  'use strict';
  function makeFromStat(stat) {
    if (!stat || typeof stat.id !== 'string') return null;
    let key;
    try { key = decodeURIComponent(stat.id); } catch { return null; }
    const nameMatch = /^sanghan-name-(\d+)-blank-(\d+)$/.exec(key);
    if (nameMatch) {
      const q = CONFIG['sanghan-names'].data.find(x => x.num === Number(nameMatch[1]));
      const target = Number(nameMatch[2]) - 1;
      if (!q || !q.answers || target < 0 || target >= q.answers.length) return null;
      return {
        key, group: stat.group, label: stat.label, type: 'name',
        title: `${q.num}조 · 처방명 빈칸 ${target + 1}`, parts: q.parts,
        answers: q.answers, target, answer: q.answers[target],
        accepted: NAME_KO[q.answers[target]] ? `${NAME_KO[q.answers[target]]} · ${q.answers[target]}` : q.answers[target]
      };
    }
    const dajaMatch = /^sanghan-daja-(\d+)-(.+)$/.exec(key);
    if (dajaMatch) {
      const num = Number(dajaMatch[1]);
      let answer;
      try { answer = decodeURIComponent(dajaMatch[2]); } catch { return null; }
      const q = DAJA_DATA.find(x => x.num === num);
      // Only quiz-authorized blanks are eligible (no free-form answer injection).
      if (!q || !DAJA_CANDIDATES[num]?.includes(answer)) return null;
      const at = q.original.indexOf(answer);
      if (at < 0) return null;
      return {
        key, group: stat.group, label: stat.label, type: 'daja',
        title: `${num}조 · 대자`, original: q.original,
        start: at, end: at + answer.length, answer,
        accepted: answer, reading: dajaAcceptedReadings(answer)
      };
    }
    for (const mode of ['sanghan-herbs-core', 'sanghan-herbs-reference', 'bangjae-herbs']) {
      const prefix = mode + '-';
      if (!key.startsWith(prefix)) continue;
      const q = CONFIG[mode].data.find(x => prefix + x.id === key);
      if (!q) return null;
      return {
        key, group: stat.group, label: stat.label, type: 'herbs',
        title: q.name, hanja: q.hanja || '', source: q.source || '',
        answer: q.herbs.join(' · '), mode, question: q
      };
    }
    return null;
  }
  function evaluateReview(item, raw) {
    if (item.type === 'name') {
      const r = gradeNames([raw], { answers: [item.answer] });
      return { ok: r.ok };
    }
    if (item.type === 'daja') return { ok: dajaAnswerMatches(item.answer, raw) };
    if (item.type === 'herbs') {
      const r = gradeHerbs([raw], item.question);
      return { ok: r.ok, missing: r.missing, extra: r.extra };
    }
    return { ok: false };
  }
  window.__QUIZ_REVIEW_API = Object.freeze({resolve: makeFromStat, grade: evaluateReview});
})();
