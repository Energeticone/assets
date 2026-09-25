/*
 * Kerry — the learning-loop engine, in the browser.
 *
 * A faithful port of the Python reference architecture. Kerry is not a model; it
 * is the learning loop the firm owns and runs on top of a swappable generalist
 * model. Everything here runs client-side — no backend, no API key — because the
 * whole point is that the firm's capital is owned and portable.
 *
 * Exposed as window.KerryEngine.
 */
(function () {
  "use strict";

  // --------------------------------------------------------------- KnowledgeBase
  // Institutional memory, made queryable — the firm's human capital in storage.
  class KnowledgeBase {
    constructor(entries) {
      this.byId = new Map();
      (entries || []).forEach((e) => this.add(e));
    }
    add(entry) {
      this.byId.set(entry.id, entry);
    }
    get(id) {
      return this.byId.get(id) || null;
    }
    all() {
      return Array.from(this.byId.values());
    }
    get size() {
      return this.byId.size;
    }
    // Targeted retrieval: surface what is relevant, not the whole corpus. Keeps
    // token use efficient and encodes the firm's sense of what matters (weight).
    query(tags) {
      const wanted = new Set(tags);
      const hits = this.all().filter((k) => k.tags.some((t) => wanted.has(t)));
      hits.sort((a, b) => b.weight - a.weight);
      return hits;
    }
    toJSON() {
      return this.all();
    }
    static fromJSON(list) {
      return new KnowledgeBase(list || []);
    }
  }

  // -------------------------------------------------------------------- Veteran
  // The company veteran that survives every model swap. Holds a growing set of
  // Lessons (token capital) and decides which institutional knowledge to deploy.
  class Veteran {
    constructor(lessons) {
      this.lessons = new Map();
      (lessons || []).forEach((l) => this.lessons.set(l.id, l));
    }
    list() {
      return Array.from(this.lessons.values());
    }
    get count() {
      return this.lessons.size;
    }
    // Take on a new lesson, or reinforce an existing one. Reinforcement is how
    // confidence compounds — instinct confirmed by repeated experience.
    absorb(lesson) {
      const existing = this.lessons.get(lesson.id);
      if (!existing) {
        this.lessons.set(lesson.id, lesson);
        return;
      }
      const merged = Array.from(new Set(existing.knowledge_ids.concat(lesson.knowledge_ids)));
      existing.knowledge_ids = merged;
      existing.confidence = Math.min(1, existing.confidence + 0.25 * (1 - existing.confidence));
    }
    // The firm's judgment, applied — and model-independent. A lesson fires only
    // when its learned task-profile fits this task (subset, not any-overlap), so
    // it never leaks knowledge into a merely tag-adjacent task.
    decide(task, kb) {
      const taskTags = new Set(task.tags);
      const wanted = [];
      this.list().forEach((lesson) => {
        const fits = lesson.trigger_tags.every((t) => taskTags.has(t));
        if (fits && lesson.confidence >= 0.2) wanted.push(...lesson.knowledge_ids);
      });
      const seen = new Set();
      const surfaced = [];
      wanted.forEach((id) => {
        if (seen.has(id)) return;
        seen.add(id);
        const e = kb.get(id);
        if (e) surfaced.push(e);
      });
      return surfaced;
    }
    toJSON() {
      return this.list();
    }
    static fromJSON(list) {
      return new Veteran(list || []);
    }
  }

  // ---------------------------------------------------------------- PrivateEvals
  // Graded against outcomes that matter to the business, not external benchmarks.
  class PrivateEvals {
    constructor(kb) {
      this.kb = kb;
    }
    expectedIds(task) {
      return this.kb.query(task.tags).map((k) => k.id);
    }
    grade(task, response) {
      const expected = this.expectedIds(task);
      const surfaced = new Set(response.surfaced_knowledge_ids);
      if (expected.length === 0) {
        return {
          task_id: task.id,
          score: 1,
          expected_knowledge_ids: [],
          surfaced_knowledge_ids: Array.from(surfaced),
          missed_knowledge_ids: [],
        };
      }
      const hit = expected.filter((id) => surfaced.has(id));
      const missed = expected.filter((id) => !surfaced.has(id));
      // Precision penalty: surfacing irrelevant knowledge wastes tokens and erodes
      // trust, so the firm rewards focus, not volume.
      const irrelevant = Array.from(surfaced).filter((id) => !expected.includes(id));
      const recall = hit.length / expected.length;
      const score = Math.max(0, recall - 0.1 * irrelevant.length);
      return {
        task_id: task.id,
        score: Math.round(score * 10000) / 10000,
        expected_knowledge_ids: expected,
        surfaced_knowledge_ids: Array.from(surfaced),
        missed_knowledge_ids: missed,
      };
    }
  }

  // --------------------------------------------------------------- RLEnvironment
  // A private RL environment built from real in-house traces. It does not retrain
  // anyone's weights — it distills durable Lessons the firm keeps.
  class RLEnvironment {
    constructor(baseConfidence, maxNewPerCycle) {
      this.baseConfidence = baseConfidence == null ? 0.5 : baseConfidence;
      this.maxNewPerCycle = maxNewPerCycle == null ? 2 : maxNewPerCycle;
    }
    reward(score, tokens) {
      const efficiency = 1 / (1 + tokens / 100);
      return Math.round((0.9 * score + 0.1 * efficiency) * 10000) / 10000;
    }
    distill(trace) {
      const missed = trace.eval_result.missed_knowledge_ids;
      if (!missed.length) return [];
      const learnNow = missed.slice().sort().slice(0, this.maxNewPerCycle);
      const triggerTags = trace.task.tags.slice().sort();
      return [
        {
          id: "lesson::" + triggerTags.join(","),
          trigger_tags: triggerTags,
          knowledge_ids: learnNow,
          confidence: this.baseConfidence,
          origin_cycle: trace.cycle,
        },
      ];
    }
  }

  // ------------------------------------------------------------- CapitalLedger
  // Accounting for the two forms of capital, and how they compound.
  class CapitalLedger {
    constructor() {
      this.records = [];
    }
    humanCapital(kb, numTasks) {
      const knowledge = kb.all().reduce((s, k) => s + k.weight, 0);
      return Math.round((knowledge + numTasks) * 10000) / 10000;
    }
    tokenCapital(veteran) {
      const v = veteran.list().reduce((s, l) => s + l.knowledge_ids.length * l.confidence, 0);
      return Math.round(v * 10000) / 10000;
    }
    record(cycle, kb, veteran, numTasks, meanScore, meanTokens, modelId) {
      const snap = {
        cycle,
        human_capital: this.humanCapital(kb, numTasks),
        token_capital: this.tokenCapital(veteran),
        mean_eval_score: Math.round(meanScore * 10000) / 10000,
        mean_tokens: Math.round(meanTokens * 100) / 100,
        model_id: modelId,
      };
      this.records.push(snap);
      return snap;
    }
    history() {
      return this.records.slice();
    }
  }

  // ------------------------------------------------------------------ Generalists
  // The swappable commodity layer. Prose in, prose out — nothing firm-specific.
  // Deterministic and offline so the sovereignty test is reproducible anywhere.
  function weave(task, context, opener, bullet) {
    const lines = [opener + " " + task.prompt];
    context.forEach((k) => lines.push(bullet + " " + k.fact));
    const text = lines.join("\n");
    return { text: text, tokens: text.split(/\s+/).filter(Boolean).length };
  }

  const GENERALISTS = {
    echo: {
      model_id: "offline:echo-v1",
      label: "Echo (offline)",
      generate: (task, ctx) => {
        const w = weave(task, ctx, "Here is what we know about", "-");
        return { text: w.text, model_id: "offline:echo-v1", tokens: w.tokens };
      },
    },
    paraphrase: {
      model_id: "offline:paraphrase-v1",
      label: "Paraphrase (offline)",
      generate: (task, ctx) => {
        const w = weave(task, ctx, "On the question of", "•");
        return { text: w.text, model_id: "offline:paraphrase-v1", tokens: w.tokens };
      },
    },
    formal: {
      model_id: "offline:formal-v1",
      label: "Formal (offline)",
      generate: (task, ctx) => {
        const w = weave(task, ctx, "Advisory regarding", "›");
        return { text: w.text, model_id: "offline:formal-v1", tokens: w.tokens };
      },
    },
  };

  // ------------------------------------------------------------------------ Kerry
  // The hill-climbing machine. One pass: retrieve → draft → evaluate → reward →
  // distill → absorb. Repeat and human + token capital compound.
  class Kerry {
    constructor(generalist, kb, veteran) {
      this.generalist = generalist;
      this.kb = kb;
      this.veteran = veteran || new Veteran();
      this.evals = new PrivateEvals(this.kb);
      this.rl = new RLEnvironment();
      this.ledger = new CapitalLedger();
      this.traces = [];
      this.cycle = 0;
    }
    swapGeneralist(generalist) {
      // Rip out the commodity model; the knowledge base, veteran, evals, RL env
      // and ledger are all untouched. That is sovereignty.
      this.generalist = generalist;
    }
    runTask(task) {
      const surfaced = this.veteran.decide(task, this.kb);
      const draft = this.generalist.generate(task, surfaced);
      const response = {
        text: draft.text,
        surfaced_knowledge_ids: surfaced.map((k) => k.id),
        model_id: draft.model_id,
        tokens: draft.tokens,
      };
      const evalResult = this.evals.grade(task, response);
      const reward = this.rl.reward(evalResult.score, response.tokens);
      const trace = {
        cycle: this.cycle,
        task: task,
        response: response,
        eval_result: evalResult,
        reward: reward,
        model_id: draft.model_id,
        created_at: Date.now(),
      };
      this.rl.distill(trace).forEach((l) => this.veteran.absorb(l));
      this.traces.push(trace);
      return trace;
    }
    runCycle(tasks) {
      const traces = tasks.map((t) => this.runTask(t));
      const meanScore = traces.reduce((s, t) => s + t.eval_result.score, 0) / traces.length;
      const meanTokens = traces.reduce((s, t) => s + t.response.tokens, 0) / traces.length;
      const snap = this.ledger.record(
        this.cycle,
        this.kb,
        this.veteran,
        tasks.length,
        meanScore,
        meanTokens,
        this.generalist.model_id
      );
      this.cycle += 1;
      return { snapshot: snap, traces: traces };
    }
    climb(tasks, cycles) {
      const out = [];
      for (let i = 0; i < cycles; i++) out.push(this.runCycle(tasks).snapshot);
      return out;
    }
  }

  window.KerryEngine = {
    KnowledgeBase,
    Veteran,
    PrivateEvals,
    RLEnvironment,
    CapitalLedger,
    Kerry,
    GENERALISTS,
  };
})();
