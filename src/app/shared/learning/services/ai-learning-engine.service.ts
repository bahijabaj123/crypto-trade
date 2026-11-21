import { Injectable, inject } from '@angular/core';
import {
  BIAS_CASES,
  BRIEFING_QUOTES,
  CRISIS_TEMPLATES,
  MENTOR_CASES_BASE,
} from '../data/ai-lab-corpus';
import {
  BiasDebrief,
  BiasFeedItem,
  BiasScenario,
  CognitiveBias,
  CrisisAction,
  CrisisDebrief,
  CrisisScenario,
  CrisisTick,
  MentorCase,
  MentorQuestion,
  PersonalizedBriefing,
} from '../models/ai-lab.models';
import { FormationService } from './formation.service';

class Rng {
  constructor(private s: number) {}
  next(): number {
    this.s = (this.s * 16807) % 2147483647;
    return (this.s - 1) / 2147483646;
  }
  int(max: number): number {
    return Math.floor(this.next() * max);
  }
  pick<T>(arr: T[]): T {
    return arr[this.int(arr.length)];
  }
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}

@Injectable({ providedIn: 'root' })
export class AiLearningEngineService {
  private readonly formation = inject(FormationService);

  generateBriefing(): PersonalizedBriefing {
    const rng = new Rng((Date.now() % 2147483646) + 2);
    const skills = this.formation.getSkillProgress().sort((a, b) => a.percent - b.percent);
    const weakest = skills[0];
    const stats = this.formation.getGlobalStats();
    const level = this.formation.getLearnerLevel();
    const diagnosis =
      weakest.percent < 40
        ? `Votre radar montre un trou sur « ${weakest.label} » (${weakest.percent} %). Un quiz ne le comblera pas : il faut un stress réel.`
        : `Niveau ${level.level} · ${stats.xpTotal} XP. Le prochain saut n’est pas un module : c’est une décision sous pression.`;
    const drills = [
      'Survivez une cascade de liquidations sans augmenter la taille.',
      'Identifiez le piège cognitif dans un fil social généré à l’instant.',
      'Répondez au mentor sans réciter : justifiez une invalidation.',
    ];
    return {
      greeting: `${level.title}, session générée ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`,
      focusSkill: weakest.label,
      diagnosis,
      drill: rng.pick(drills),
      quote: rng.pick(BRIEFING_QUOTES),
    };
  }

  generateCrisis(): CrisisScenario {
    const rng = new Rng((Date.now() % 2147483646) + 3);
    const tpl = rng.pick(CRISIS_TEMPLATES);
    const headBlock = rng.pick(tpl.headlines);
    const start = Math.round(rng.range(28_000, 72_000));
    const candles = [start];
    const ticks: CrisisTick[] = [];
    let price = start;
    const n = 8 + rng.int(3);
    for (let i = 0; i < n; i++) {
      const shock = i === 0 ? rng.range(-1.2, 0.4) : rng.range(-6.5, 2.2);
      const move = i > 3 && rng.next() > 0.55 ? shock * 1.4 : shock;
      price = Math.max(1, price * (1 + move / 100));
      candles.push(Math.round(price));
      const headline = headBlock[i % headBlock.length];
      const twist =
        i === n - 2
          ? ' — rumeur démentie 40 s plus tard'
          : i === 3
            ? ' — liquidité -70 % sur le best bid'
            : '';
      ticks.push({
        minute: i * 7 + rng.int(4),
        headline: headline + twist,
        source: rng.pick(['Tape', 'Twitter', 'On-chain', 'Desk', 'Oracle']),
        movePct: Math.round(move * 10) / 10,
        funding: `${(rng.range(0.01, 0.18) * (move < 0 ? 1 : -1)).toFixed(3)} %`,
        liquidationsUsd: `${Math.round(rng.range(40, 890))} M$`,
      });
    }
    return {
      id: `crisis-${Date.now()}`,
      kind: tpl.kind,
      title: rng.pick(tpl.titles),
      mentorHook: rng.pick(tpl.hooks),
      asset: rng.pick(tpl.assets),
      startingEquity: 100_000,
      positionPct: 40 + rng.int(35),
      leverage: rng.pick([2, 3, 5, 8]),
      ticks,
      candles,
      disciplineRule: tpl.discipline,
      trap: tpl.trap,
      idealActions: tpl.kind === 'NARRATIVE' || tpl.kind === 'HACK' ? ['CUT_25', 'HEDGE', 'CUT_ALL'] : ['CUT_25', 'HEDGE', 'HOLD'],
    };
  }

  simulateCrisis(scenario: CrisisScenario, actions: CrisisAction[]): CrisisDebrief {
    let equity = scenario.startingEquity;
    let exposure = scenario.positionPct / 100;
    const lev = scenario.leverage;
    scenario.ticks.forEach((tick, i) => {
      const action = actions[i] ?? 'HOLD';
      if (action === 'CUT_25') exposure *= 0.75;
      if (action === 'CUT_ALL') exposure = 0;
      if (action === 'HEDGE') exposure *= 0.45;
      if (action === 'ADD') exposure = Math.min(1.4, exposure * 1.25);
      const shock = (tick.movePct / 100) * lev * exposure;
      equity *= 1 + shock;
      if (equity < scenario.startingEquity * 0.15) {
        equity = scenario.startingEquity * 0.12;
        exposure = 0;
      }
    });
    const pnlPct = Math.round(((equity / scenario.startingEquity - 1) * 1000) / 10);
    const added = actions.filter((a) => a === 'ADD').length;
    const cuts = actions.filter((a) => a === 'CUT_25' || a === 'CUT_ALL' || a === 'HEDGE').length;
    const survived = equity > scenario.startingEquity * 0.55 && added <= 1;
    let grade: CrisisDebrief['grade'] = 'D';
    if (survived && pnlPct > -8 && cuts >= 2) grade = 'A';
    else if (survived && added === 0) grade = 'B';
    else if (equity > scenario.startingEquity * 0.4) grade = 'C';
    const bullets = [
      `Règle d’or de ce run : ${scenario.disciplineRule}`,
      added > 1 ? `Piège touché : ${scenario.trap}` : 'Vous n’avez pas nourri la cascade.',
      cuts === 0
        ? 'Aucune réduction : en crise, l’inaction est déjà un pari directionnel.'
        : `${cuts} geste(s) de réduction — c’est le langage du risk management.`,
      `Levier ${scenario.leverage}x × exposition initiale ${scenario.positionPct} % = un mouvement de 5 % n’est pas un « petit rouge ».`,
    ];
    const xp = grade === 'A' ? 90 : grade === 'B' ? 70 : grade === 'C' ? 45 : 25;
    this.formation.awardLabXp('Lab crise', `${scenario.title} · grade ${grade}`, xp);
    return {
      finalEquity: Math.round(equity),
      pnlPct,
      survived,
      grade,
      xp,
      headline: survived
        ? 'Vous avez traité la crise comme un risque, pas comme un ego.'
        : 'Le compte a parlé : la survie passe avant le rebond imaginaire.',
      bullets,
      nextDrill: 'Enchaînez sur le Lab biais : la crise suivante commencera dans votre tête, pas sur le tape.',
    };
  }

  generateBias(): BiasScenario {
    const rng = new Rng((Date.now() % 2147483646) + 5);
    const base = rng.pick(BIAS_CASES);
    const start = Math.round(rng.range(1_800, 68_000));
    const candles = [start];
    let p = start;
    for (let i = 0; i < 18; i++) {
      p *= 1 + rng.range(-0.03, 0.035);
      candles.push(Math.round(p));
    }
    const feed: BiasFeedItem[] = [
      { kind: 'tweet', author: rng.pick(['@alphaKing', '@onchainWizard', '@macroDegen']), text: rng.pick(base.tweets), heat: 70 + rng.int(30) },
      { kind: 'news', author: rng.pick(['CoinFlash', 'DeskNote', 'The Block-like']), text: rng.pick(base.news), heat: 40 + rng.int(30) },
      { kind: 'telegram', author: 'VIP Signals', text: rng.pick(base.telegram), heat: 85 + rng.int(15) },
      { kind: 'influencer', author: rng.pick(['YouTube 2.1M', 'TikTok live']), text: rng.pick(base.tweets), heat: 60 + rng.int(25) },
      { kind: 'onchain', author: 'Lab IA', text: rng.pick(['Whale label conflictuelle : exchange vs cold.', 'Funding crowded, basis instable.', 'Liq heatmap : poche évidente sous le round number.']), heat: 50 + rng.int(20) },
    ];
    const all: CognitiveBias[] = ['FOMO', 'REVENGE', 'CONFIRMATION', 'ANCHORING', 'RECENCY', 'OVERCONFIDENCE', 'LOSS_AVERSION', 'NARRATIVE'];
    const decoyPool = all.filter((b) => !base.trueBiases.includes(b));
    const decoy: CognitiveBias[] = [];
    while (decoy.length < 3 && decoyPool.length) {
      decoy.push(decoyPool.splice(rng.int(decoyPool.length), 1)[0]);
    }
    return {
      id: `bias-${Date.now()}`,
      title: base.title,
      marketContext: rng.pick(base.context),
      candles,
      feed,
      trueBiases: [...base.trueBiases],
      decoyBiases: decoy,
      soundAction: rng.pick(base.sound),
      trapAction: rng.pick(base.trap),
      mentorNote: rng.pick(base.notes),
    };
  }

  scoreBias(scenario: BiasScenario, picked: CognitiveBias[], choseSound: boolean, rationale: string): BiasDebrief {
    const identified = picked.filter((b) => scenario.trueBiases.includes(b));
    const missed = scenario.trueBiases.filter((b) => !picked.includes(b));
    const falsePositives = picked.filter((b) => !scenario.trueBiases.includes(b));
    let score = identified.length * 28 - falsePositives.length * 10 - missed.length * 8;
    if (choseSound) score += 24;
    const words = rationale.toLowerCase();
    if (words.length > 40 && (words.includes('stop') || words.includes('taille') || words.includes('plan') || words.includes('inval'))) {
      score += 12;
    }
    score = Math.max(0, Math.min(100, score));
    const xp = Math.round(20 + score * 0.7);
    this.formation.awardLabXp('Lab biais', `${scenario.title} · ${score} %`, xp);
    const narrative = [
      scenario.mentorNote,
      identified.length ? `Vu correctement : ${identified.join(', ')}.` : 'Les biais actifs sont passés sous le radar.',
      missed.length ? `Manqué : ${missed.join(', ')}.` : 'Couverture des biais principale : solide.',
      choseSound ? 'Action alignée avec la discipline.' : `L’action piège était : ${scenario.trapAction}`,
    ].join(' ');
    return { identified, missed, falsePositives, actionSound: choseSound, score, xp, narrative };
  }

  generateMentorCase(): MentorCase {
    const rng = new Rng((Date.now() % 2147483646) + 7);
    const base = rng.pick(MENTOR_CASES_BASE);
    const start = Math.round(rng.range(2_400, 71_000));
    const candles = [start];
    let p = start;
    for (let i = 0; i < 16; i++) {
      p *= 1 + rng.range(-0.018, 0.016);
      candles.push(Math.round(p));
    }
    const questions: MentorQuestion[] = base.questions.map((q) => ({
      prompt: q.prompt,
      concepts: q.keys.map(([key, aliases]) => ({
        key,
        aliases,
        coachIfMissing: `Je n’ai pas entendu l’idée « ${key} ». Reformulez avec le mécanisme, pas le slogan.`,
      })),
    }));
    return {
      id: `mentor-${Date.now()}`,
      title: base.title,
      brief: rng.pick(base.briefs),
      hiddenTruth: rng.pick(base.hidden),
      candles,
      questions,
      synthesisStrong: base.strong,
      synthesisWeak: base.weak,
      relatedCourseId: base.courseId,
    };
  }

  evaluateMentorAnswer(question: MentorQuestion, text: string): { hits: string[]; misses: string[]; coach: string; strong: boolean } {
    const norm = this.normalize(text);
    const hits: string[] = [];
    const misses: string[] = [];
    for (const c of question.concepts) {
      const ok = c.aliases.some((a) => norm.includes(this.normalize(a)));
      if (ok) hits.push(c.key);
      else misses.push(c.key);
    }
    const short = norm.split(' ').filter(Boolean).length < 8;
    const strong = hits.length >= Math.ceil(question.concepts.length / 2) && !short;
    const coach = strong
      ? 'Bien. Vous touchez le mécanisme. Creusons le suivant.'
      : misses.length
        ? question.concepts.find((c) => misses.includes(c.key))?.coachIfMissing ?? 'Plus précis.'
        : 'Trop court : un trader justifie, il ne vote pas.';
    return { hits, misses, coach, strong };
  }

  finishMentor(hitsTotal: number, questions: number, kase: MentorCase): { xp: number; synthesis: string; strong: boolean } {
    const ratio = questions === 0 ? 0 : hitsTotal / (questions * 2);
    const strong = ratio >= 0.45;
    const xp = strong ? 85 : 40;
    this.formation.awardLabXp('Mentor socratique', kase.title, xp);
    return {
      xp,
      strong,
      synthesis: strong ? kase.synthesisStrong : `${kase.synthesisWeak} Vérité cachée du cas : ${kase.hiddenTruth}`,
    };
  }

  private normalize(s: string): string {
    return s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }
}
