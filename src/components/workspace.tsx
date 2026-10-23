"use client";
import { useEffect, useRef, useState } from "react";
import { createClient, type Session } from "@supabase/supabase-js";
import { ArrowUp, ArrowUpRight, Check, FileText, Menu, Plus, Upload, X } from "lucide-react";
import {
  emptyWorkspace,
  savedStateSchema,
  workspaceSchema,
  type Workspace,
  type Plan,
  type Extraction,
  type Adjustment,
} from "@/lib/contracts";
import type { runAgent } from "@/lib/agent";
import { baseline, forecast, formatMoney } from "@/lib/finance";
import { demoCsv, demoWorkspace } from "@/lib/demo";
import { parseCsv } from "@/lib/transactions";
import { deleteLocalMemory, loadLocalMemory, saveLocalMemory } from "@/lib/browser-memory";
import { Button } from "./ui/button";
import { ProfileEditor } from "./profile-editor";
import { Evidence } from "./evidence";
import { Future } from "./future";

type Result = Awaited<ReturnType<typeof runAgent>>;
const supabase =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    : null;
const initialScenario = { ...baseline, label: "My alternative" };
export function WorkspaceApp() {
  const [workspace, setWorkspace] = useState<Workspace>(structuredClone(emptyWorkspace));
  const [plans, setPlans] = useState<Plan[]>([]);
  const [scenario, setScenario] = useState<Adjustment>(initialScenario);
  const [result, setResult] = useState<Result | null>(null);
  const [proposal, setProposal] = useState<Extraction | null>(null);
  const [history, setHistory] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState({
    aiConfigured: false,
    cloudConfigured: false,
    publicDemoAi: false,
  });
  const [selected, setSelected] = useState<number[]>([]);
  const [showAccount, setShowAccount] = useState(false);
  const [menu, setMenu] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const revision = useRef(0);
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      try {
        const saved = loadLocalMemory(localStorage);
        if (saved) {
          setWorkspace(saved.workspace);
          setPlans(saved.plans);
          setNotice("Your approved plan has been restored from this browser.");
        }
      } catch {
        setError("Saved browser data could not be read. You can clear it in Financial memory.");
      }
      setLoaded(true);
    });
    fetch("/api/status")
      .then((r) => r.json())
      .then((s) => {
        if (active) setStatus(s);
      })
      .catch(() => {
        if (active) setError("Could not check service availability.");
      });
    const subscription = supabase?.auth.onAuthStateChange((_event, next) => {
      if (active) setSession(next);
    });
    return () => {
      active = false;
      subscription?.data.subscription.unsubscribe();
    };
  }, []);
  function change(next: Workspace) {
    try {
      setWorkspace(workspaceSchema.parse(next));
      revision.current++;
      setResult(null);
      setSelected([]);
      setProposal(null);
      setScenario(initialScenario);
      setNotice("Updated for this session. Save your memory to keep these changes.");
    } catch {
      setError("That change could not be applied. Check the input limits.");
    }
  }
  async function request(path: string, body?: unknown, method = "POST") {
    const { data: authData } = supabase
      ? await supabase.auth.getSession()
      : { data: { session: null } };
    const response = await fetch(path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(authData.session ? { Authorization: `Bearer ${authData.session.access_token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
  }
  async function investigate(text = message) {
    if (!text.trim() || busy) return;
    setBusy("Investigation in progress…");
    setError("");
    setNotice("");
    const currentRevision = revision.current;
    try {
      const data: Result = await request("/api/agent", {
        message: text,
        workspace,
        plans,
        history: history.slice(-8),
      });
      if (currentRevision !== revision.current) {
        setNotice(
          "Your information changed during this investigation. Ask again to use the latest facts.",
        );
        return;
      }
      setResult(data);
      setSelected([]);
      setHistory(
        (h) =>
          [
            ...h,
            { role: "user", content: text },
            {
              role: "assistant",
              content:
                data.response.investigation_summary +
                " " +
                (data.response.clarification_question ?? ""),
            },
          ].slice(-8) as typeof history,
      );
      setMessage("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Investigation failed.");
    } finally {
      setBusy("");
    }
  }
  async function extract() {
    if (!message.trim() || busy) return;
    setBusy("Reading your stated goals…");
    setError("");
    const currentRevision = revision.current;
    try {
      const data = await request("/api/extract", { message, workspace });
      if (currentRevision === revision.current) setProposal(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not extract your goal.");
    } finally {
      setBusy("");
    }
  }
  function persist(nextPlans = plans, nextWorkspace = workspace) {
    try {
      saveLocalMemory(localStorage, nextWorkspace, nextPlans);
      setPlans(nextPlans);
      setNotice("Saved in this browser. Cloud storage is separate.");
      return true;
    } catch {
      setError("Browser storage is unavailable or full. Nothing was saved.");
      return false;
    }
  }
  function savePlan(actions: string[], adjustment: Adjustment | null) {
    const next: Plan = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      title: workspace.profile.goal || "My financial plan",
      actions,
      assumptions: structuredClone(workspace.profile),
      scenario: adjustment,
    };
    persist([...plans, next]);
  }
  async function cloud(method: "GET" | "PUT" | "DELETE") {
    setError("");
    setBusy(
      method === "GET"
        ? "Loading approved memory…"
        : method === "PUT"
          ? "Saving approved memory…"
          : "Deleting cloud memory…",
    );
    try {
      const data = await request(
        "/api/memory",
        method === "PUT" ? { approved: true, state: { workspace, plans } } : undefined,
        method,
      );
      if (method === "GET" && data.state) {
        const state = savedStateSchema.parse(data.state);
        change(state.workspace);
        setPlans(state.plans);
        setNotice("Loaded your approved cloud memory.");
      } else
        setNotice(
          method === "GET"
            ? "No cloud memory saved yet."
            : method === "PUT"
              ? "Your approved memory was saved to your account."
              : "Cloud memory deleted.",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cloud operation failed.");
    } finally {
      setBusy("");
    }
  }
  function loadDemo(kind: "student" | "freelancer") {
    change(demoWorkspace(kind));
    setPlans([]);
    setHistory([]);
    setNotice(
      `Loaded synthetic ${kind} transactions. Confirm your assumptions and review recurring payments to begin.`,
    );
  }
  const aiReady =
    status.aiConfigured &&
    (Boolean(session) || (status.publicDemoAi && workspace.source.startsWith("synthetic-")));
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? "mobile-open" : ""}`}>
        <a className="brand" href="#">
          <span className="brand-mark">s</span>subwise<span className="brand-period">.</span>
        </a>
        <Button
          className="mobile-close"
          variant="ghost"
          onClick={() => setMenu(false)}
          aria-label="Close navigation"
        >
          <X size={18} />
        </Button>
        <p className="nav-label">YOUR WORKSPACE</p>
        <nav aria-label="Main navigation">
          <a className="active" href="#investigation" onClick={() => setMenu(false)}>
            <span>01</span> Investigation
          </a>
          <a href="#evidence" onClick={() => setMenu(false)}>
            <span>02</span> Money X-ray
          </a>
          <a href="#future" onClick={() => setMenu(false)}>
            <span>03</span> Financial future
          </a>
          <a href="#memory" onClick={() => setMenu(false)}>
            <span>04</span> Financial memory
          </a>
        </nav>
        <div className="sidebar-note">
          <div className="mini-rule" />
          <p>
            Make room for
            <br />
            <em>what matters.</em>
          </p>
          <small>
            A clearer view of your money.
            <br />
            One decision at a time.
          </small>
        </div>
        <button className="account-button" onClick={() => setShowAccount(!showAccount)}>
          <span className="avatar">{session ? "EN" : "G"}</span>
          <span>
            {session ? "Your account" : "Guest workspace"}
            <small>{session ? "Cloud memory available" : "Saved only when you choose"}</small>
          </span>
          <ArrowUpRight size={15} />
        </button>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <button
              className="mobile-toggle"
              onClick={() => setMenu(true)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <span>Personal finance, with perspective</span>
          </div>
          <div className="topbar-right">
            <span className="currency">NGN ₦</span>
            <span className="status-dot" />
            <span>
              {workspace.source.startsWith("synthetic") ? "Synthetic demo" : "Your workspace"}
            </span>
          </div>
        </header>
        <main>
          <div className="page-intro">
            <div>
              <p className="eyebrow">A LITTLE CLARITY GOES A LONG WAY</p>
              <h1>
                Your money has a future.
                <br />
                <span>Let’s make sense of it.</span>
              </h1>
              <p>
                Understand what’s happening. Explore what could change.
                <br className="desktop-only" /> Build a plan that feels like yours.
              </p>
            </div>
            <div className="intro-stamp">
              <span>LESS GUESSWORK</span>
              <svg viewBox="0 0 90 65" fill="none" aria-hidden="true">
                <path
                  d="M4 55L28 38L44 43L76 10M57 10H77V30"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
              <span>MORE DIRECTION</span>
            </div>
          </div>
          {!loaded && <p role="status">Opening your workspace…</p>}
          {error && (
            <div role="alert" className="banner error">
              <span>{error}</span>
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="banner">
              <Check size={16} />
              <span>{notice}</span>
              <button onClick={() => setNotice("")} aria-label="Dismiss notice">
                <X size={16} />
              </button>
            </div>
          )}
          {showAccount && (
            <section className="panel account-panel">
              <h2>Your account</h2>
              {!supabase ? (
                <p className="helper">
                  Cloud accounts are not configured. You can still work locally and save explicitly
                  to this browser.
                </p>
              ) : session ? (
                <>
                  <p className="helper">
                    Signed in as {session.user.email}. Cloud data is loaded only when you choose it.
                  </p>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      await supabase.auth.signOut();
                      revision.current++;
                      setWorkspace(structuredClone(emptyWorkspace));
                      setPlans([]);
                      setHistory([]);
                      setResult(null);
                      setScenario(initialScenario);
                      setNotice(
                        "Signed out and cleared the active workspace. Explicit browser saves remain until deleted.",
                      );
                    }}
                  >
                    Sign out
                  </Button>
                </>
              ) : (
                <form
                  className="inline-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const email = String(new FormData(e.currentTarget).get("email"));
                    const { error } = await supabase.auth.signInWithOtp({
                      email,
                      options: { emailRedirectTo: window.location.origin },
                    });
                    if (error) setError(error.message);
                    else setNotice("Check your email for a sign-in link.");
                  }}
                >
                  <label>
                    Email address
                    <input type="email" name="email" required placeholder="you@example.com" />
                  </label>
                  <Button type="submit">Email me a sign-in link</Button>
                </form>
              )}
            </section>
          )}
          <fieldset disabled={Boolean(busy) || !loaded} className="workspace-fieldset">
            <div className="workspace-grid">
              <div className="primary-column">
                <section className="panel investigation" id="investigation">
                  <div className="section-heading">
                    <div className="heading-icon">
                      <span className="small-mark">s</span>
                      <h2>What’s on your mind?</h2>
                    </div>
                    <span className="tag">Start here</span>
                  </div>
                  <p className="helper">
                    Tell SubWise what you want to understand about your money.
                  </p>
                  <form
                    className="composer"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void investigate();
                    }}
                  >
                    <label className="sr-only" htmlFor="question">
                      Your financial question
                    </label>
                    <textarea
                      id="question"
                      ref={inputRef}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      maxLength={3000}
                      placeholder="I receive about ₦80,000 a month and want to save ₦20,000. Can I make it work?"
                      rows={4}
                    />
                    <div className="composer-footer">
                      <button
                        type="button"
                        className="text-button"
                        disabled={!message.trim() || !aiReady}
                        onClick={() => void extract()}
                      >
                        Extract my goals for review
                      </button>
                      <Button
                        type="submit"
                        disabled={!message.trim() || !aiReady}
                        aria-label="Send financial question"
                      >
                        <ArrowUp size={18} />
                      </Button>
                    </div>
                  </form>
                  {!aiReady && (
                    <p className="service-note">
                      {!status.aiConfigured
                        ? "Live AI is not connected yet. You can use transaction analysis and the scenario calculator below."
                        : "Sign in to investigate your finances with live AI."}
                    </p>
                  )}
                  <div className="question-chips">
                    {[
                      "Where might my money be going?",
                      "Can I reach my savings goal?",
                      "What if my income drops?",
                    ].map((q) => (
                      <button
                        key={q}
                        onClick={() => {
                          setMessage(q);
                          inputRef.current?.focus();
                        }}
                      >
                        {q}
                        <ArrowUpRight size={13} />
                      </button>
                    ))}
                  </div>
                  {proposal && (
                    <div className="proposal">
                      <h3>Review what SubWise understood</h3>
                      <p className="helper">{proposal.explanation}</p>
                      <ul>
                        {(["income", "savings", "essentials"] as const).map((k) => (
                          <li key={k}>
                            {k}: {proposal[k] === null ? "Not stated" : formatMoney(proposal[k])}
                          </li>
                        ))}
                        <li>
                          Income varies:{" "}
                          {proposal.irregularIncome === null
                            ? "Not stated"
                            : proposal.irregularIncome
                              ? "Yes"
                              : "No"}
                        </li>
                        <li>Goal: {proposal.goal ?? "Not stated"}</li>
                      </ul>
                      <div className="actions">
                        <Button
                          size="sm"
                          onClick={() => {
                            const p = { ...workspace.profile };
                            for (const k of ["income", "savings", "essentials"] as const)
                              if (proposal[k] !== null) p[k] = proposal[k];
                            if (proposal.irregularIncome !== null)
                              p.irregularIncome = proposal.irregularIncome;
                            if (proposal.goal !== null) p.goal = proposal.goal;
                            change({ ...workspace, profile: p });
                          }}
                        >
                          Confirm extracted facts
                        </Button>
                        <Button variant="ghost" onClick={() => setProposal(null)}>
                          Discard
                        </Button>
                      </div>
                    </div>
                  )}
                  {result && (
                    <div className="agent-result">
                      <p className="eyebrow">INVESTIGATION</p>
                      <p>{result.response.investigation_summary}</p>
                      {result.response.clarification_question && (
                        <div className="clarification">
                          <strong>One thing to clarify</strong>
                          <p>{result.response.clarification_question}</p>
                        </div>
                      )}
                      {result.response.relevant_findings.map((f, i) => (
                        <div className="finding" key={i}>
                          <span className="tag">{f.status}</span>
                          <p>{f.observation}</p>
                          <small>{f.transaction_ids.join(" · ")}</small>
                        </div>
                      ))}
                      {result.scenarios.map((s) => (
                        <div className="scenario-result" key={s.id}>
                          <strong>{s.label}</strong>
                          <p>
                            Monthly remainder:{" "}
                            {s.discretionary === null ? "Unknown" : formatMoney(s.discretionary)}
                          </p>
                          <small>{s.missing.join(" · ")}</small>
                        </div>
                      ))}
                      {result.response.recommended_actions.map((a, i) => (
                        <label className="action-card" key={i}>
                          <input
                            type="checkbox"
                            checked={selected.includes(i)}
                            onChange={(e) =>
                              setSelected(
                                e.target.checked
                                  ? [...selected, i]
                                  : selected.filter((x) => x !== i),
                              )
                            }
                          />
                          <span>
                            <strong>{a.title}</strong>
                            <p>{a.explanation}</p>
                            {a.potential_monthly_impact !== null && (
                              <b>
                                {formatMoney(a.potential_monthly_impact)} potential monthly
                                difference
                              </b>
                            )}
                            <small>{a.supporting_evidence.join(" · ")}</small>
                          </span>
                        </label>
                      ))}
                      {selected.length > 0 && (
                        <Button
                          size="sm"
                          onClick={() =>
                            savePlan(
                              selected.map(
                                (i) =>
                                  `${result.response.recommended_actions[i].title}: ${result.response.recommended_actions[i].explanation}`,
                              ),
                              null,
                            )
                          }
                        >
                          Approve & save selected actions
                        </Button>
                      )}
                      <p className="helper">{result.response.next_user_action}</p>
                      <details>
                        <summary>Assumptions, uncertainty & executed tools</summary>
                        <ul>
                          {[...result.response.assumptions, ...result.response.uncertainties].map(
                            (a, i) => (
                              <li key={i}>{a}</li>
                            ),
                          )}
                        </ul>
                        {result.trace.map((t, i) => (
                          <details key={i}>
                            <summary>
                              {t.name} · {t.durationMs} ms
                            </summary>
                            <pre>{JSON.stringify(t.result, null, 2)}</pre>
                          </details>
                        ))}
                        {result.trace.length === 0 && (
                          <p className="helper">No tools were executed in this response.</p>
                        )}
                      </details>
                    </div>
                  )}
                </section>
                <Future
                  workspace={workspace}
                  scenario={scenario}
                  setScenario={setScenario}
                  onExplain={() => {
                    setMessage(
                      `Please compare and explain this hypothetical scenario against my current plan. All amounts below are kobo: ${JSON.stringify(scenario)}`,
                    );
                    inputRef.current?.focus();
                    document
                      .getElementById("investigation")
                      ?.scrollIntoView({ behavior: "smooth" });
                  }}
                  onSave={() => {
                    const f = forecast(workspace, scenario);
                    savePlan(
                      [
                        `Explore ${formatMoney(f.savings!)} monthly savings over ${scenario.months} months.`,
                        ...(scenario.omitMerchants.length
                          ? [
                              `Consider stopping: ${scenario.omitMerchants.join(", ")}. No services have been canceled.`,
                            ]
                          : []),
                      ],
                      scenario,
                    );
                  }}
                />
                <Evidence workspace={workspace} onChange={change} />
              </div>
              <div className="context-column">
                <section className="panel data-panel">
                  <div className="section-heading">
                    <h2>Your starting point</h2>
                    <FileText size={18} />
                  </div>
                  <p className="helper">Start with a sample or bring your own statement.</p>
                  <Button
                    variant="outline"
                    className="wide"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload size={15} /> Import a CSV
                  </Button>
                  <input
                    type="file"
                    ref={fileRef}
                    accept=".csv,text/csv"
                    hidden
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        if (file.size > 256000) throw new Error("CSV exceeds 256 KB.");
                        const transactions = parseCsv(await file.text());
                        change({ ...structuredClone(emptyWorkspace), source: "csv", transactions });
                        setPlans([]);
                        setHistory([]);
                        setNotice(
                          `Imported ${transactions.length} transactions into this session. Nothing was uploaded or saved.`,
                        );
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Import failed.");
                      } finally {
                        if (fileRef.current) fileRef.current.value = "";
                      }
                    }}
                  />
                  <div className="demo-options">
                    <button onClick={() => loadDemo("student")}>
                      Student sample <ArrowUpRight size={14} />
                    </button>
                    <button onClick={() => loadDemo("freelancer")}>
                      Freelancer sample <ArrowUpRight size={14} />
                    </button>
                  </div>
                  <p className="tiny">
                    Samples are synthetic. CSV: id, date, description, amount, direction. Up to 500
                    rows / 256 KB.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => {
                      const url = URL.createObjectURL(
                        new Blob([demoCsv("student")], { type: "text/csv" }),
                      );
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "subwise-synthetic-student.csv";
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    Download sample CSV
                  </button>
                  <div className="data-status">
                    <span className="status-dot" />
                    {workspace.transactions.length
                      ? `${workspace.transactions.length} transactions ready`
                      : "No statement loaded"}
                  </div>
                </section>
                <section className="panel" id="assumptions">
                  <div className="section-heading">
                    <h2>The bigger picture</h2>
                    <span className="tag">You confirm</span>
                  </div>
                  <ProfileEditor
                    key={JSON.stringify(workspace.profile)}
                    profile={workspace.profile}
                    onApply={(profile) => change({ ...workspace, profile })}
                  />
                </section>
                <section className="panel" id="memory">
                  <div className="section-heading">
                    <h2>Financial memory</h2>
                    <span className="count">{plans.length} plans</span>
                  </div>
                  <p className="helper">
                    Only keep what you choose. Saved plans are decisions, not money already saved.
                  </p>
                  <form
                    className="preference-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const value = String(new FormData(form).get("preference")).trim();
                      if (value) {
                        change({ ...workspace, preferences: [...workspace.preferences, value] });
                        form.reset();
                      }
                    }}
                  >
                    <label className="sr-only" htmlFor="preference">
                      Preference to remember
                    </label>
                    <input
                      id="preference"
                      name="preference"
                      maxLength={300}
                      placeholder="e.g. Keep my internet plan"
                    />
                    <Button variant="outline" type="submit" aria-label="Confirm preference">
                      <Plus size={16} />
                    </Button>
                  </form>
                  {workspace.preferences.map((p, i) => (
                    <div className="preference" key={i}>
                      <span>{p}</span>
                      <button
                        onClick={() =>
                          change({
                            ...workspace,
                            preferences: workspace.preferences.filter((_, j) => i !== j),
                          })
                        }
                        aria-label={`Remove preference ${p}`}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  {plans.map((p) => (
                    <details className="saved-plan" key={p.id}>
                      <summary>{p.title}</summary>
                      <small>{new Date(p.createdAt).toLocaleDateString()}</small>
                      <ul>
                        {p.actions.map((a, i) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ul>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => persist(plans.filter((plan) => plan.id !== p.id))}
                      >
                        Delete saved plan
                      </Button>
                    </details>
                  ))}
                  <div className="memory-actions">
                    <Button variant="outline" size="sm" onClick={() => persist()}>
                      Save memory in this browser
                    </Button>
                    {session && (
                      <>
                        <Button size="sm" onClick={() => void cloud("PUT")}>
                          Approve & save to account
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => void cloud("GET")}>
                          Load from account
                        </Button>
                        <button
                          className="text-button danger"
                          onClick={() => {
                            if (
                              window.confirm(
                                "Permanently delete your saved cloud financial information?",
                              )
                            )
                              void cloud("DELETE");
                          }}
                        >
                          Delete cloud memory
                        </button>
                      </>
                    )}
                    <button
                      className="text-button danger"
                      onClick={() => {
                        if (!window.confirm("Delete saved browser memory and clear this session?"))
                          return;
                        try {
                          deleteLocalMemory(localStorage);
                          change(structuredClone(emptyWorkspace));
                          setPlans([]);
                          setHistory([]);
                          setNotice("Browser memory and current session cleared.");
                        } catch {
                          setError("Could not clear browser storage.");
                        }
                      }}
                    >
                      Clear browser memory
                    </button>
                  </div>
                </section>
              </div>
            </div>
          </fieldset>
          {busy && (
            <div className="busy-indicator" role="status">
              <span className="status-dot" />
              {busy}
            </div>
          )}
          <footer>
            <span>SubWise · Your decisions. A clearer perspective.</span>
            <span>Estimates, not guarantees. No bank credentials required.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
